import "server-only";

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000];

type ContractEnv = "N8N_WEBHOOK_BASE_URL" | "N8N_WEBHOOK_TOKEN" | "APP_BASE_URL";

function env(name: ContractEnv): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export type TriggerOptions = {
  event: string;
  data: Record<string, unknown>;
  idempotencyKey: string;
  correlationId: string;
  async: boolean;
};

export type TriggerResult =
  | { ok: true; jobId: string | null; attempts: number }
  | { ok: false; reason: "misconfigured" | "rejected" | "unexpected-response" | "unreachable"; status: number | null; attempts: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJobId(response: Response): Promise<string | null> {
  const parsed: unknown = await response.json().catch(() => null);
  if (typeof parsed !== "object" || parsed === null || !("job_id" in parsed)) return null;
  return typeof parsed.job_id === "string" && parsed.job_id !== "" ? parsed.job_id : null;
}

function logAttempt(options: TriggerOptions, attempt: number, startedAt: number, result: number | string) {
  console.info(
    `n8n out event=${options.event} correlation=${options.correlationId} attempt=${attempt} result=${result} ms=${Date.now() - startedAt}`,
  );
}

export async function triggerWorkflow(options: TriggerOptions): Promise<TriggerResult> {
  let url: string;
  let token: string;
  let envelope: string;
  try {
    url = `${env("N8N_WEBHOOK_BASE_URL")}/${options.event}`;
    token = env("N8N_WEBHOOK_TOKEN");
    envelope = JSON.stringify({
      version: 1,
      event: options.event,
      data: options.data,
      ...(options.async ? { callbackUrl: `${env("APP_BASE_URL")}/api/n8n/${options.event}` } : {}),
    });
  } catch (error) {
    // A missing variable is a deploy error, not an outage: no retries, the caller marks the record failed.
    console.error(`n8n out event=${options.event} correlation=${options.correlationId} misconfigured`, error instanceof Error ? error.message : "error");
    return { ok: false, reason: "misconfigured", status: null, attempts: 0 };
  }
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-n8n-token": token,
          "idempotency-key": options.idempotencyKey,
          "x-correlation-id": options.correlationId,
        },
        body: envelope,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      logAttempt(options, attempt, startedAt, response.status);
      lastStatus = response.status;

      if (response.status < 500) {
        if (!options.async) {
          return response.ok
            ? { ok: true, jobId: null, attempts: attempt }
            : { ok: false, reason: "rejected", status: response.status, attempts: attempt };
        }
        if (response.status !== 202) {
          const reason = response.ok ? "unexpected-response" : "rejected";
          return { ok: false, reason, status: response.status, attempts: attempt };
        }
        const jobId = await readJobId(response);
        return jobId
          ? { ok: true, jobId, attempts: attempt }
          : { ok: false, reason: "unexpected-response", status: 202, attempts: attempt };
      }
    } catch (error) {
      logAttempt(options, attempt, startedAt, error instanceof Error ? error.name : "error");
    }
    if (attempt < maxAttempts) await sleep(RETRY_DELAYS_MS[attempt - 1]);
  }
  return { ok: false, reason: "unreachable", status: lastStatus, attempts: maxAttempts };
}

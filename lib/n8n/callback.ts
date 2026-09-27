import "server-only";

declare global {
  var n8nCallbackKeys: Set<string> | undefined;
}

// Demo store for one process. Production: a table or KV with a unique constraint on the key.
const claimedKeys = (globalThis.n8nCallbackKeys ??= new Set<string>());

export function claimCallbackKey(key: string): boolean {
  if (claimedKeys.has(key)) return false;
  claimedKeys.add(key);
  return true;
}

export function releaseCallbackKey(key: string): void {
  claimedKeys.delete(key);
}

// Raw body as text, or null once it exceeds maxBytes — stops reading instead of buffering a huge chunked body.
export async function readRawBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type N8nCallback = {
  event: string;
  jobId: string;
  status: "completed" | "failed";
  requestIdempotencyKey: string;
  documentUrl: string | null;
  errorCode: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Call only after the signature has been verified.
export function parseCallback(raw: string, pathEvent: string, idempotencyKey: string): N8nCallback | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.event !== "string") return null;
  const { event, data } = parsed;
  if (event !== `${pathEvent}.completed` && event !== `${pathEvent}.failed`) return null;
  if (!isRecord(data) || typeof data.jobId !== "string" || data.jobId === "") return null;
  if (typeof data.requestIdempotencyKey !== "string" || data.requestIdempotencyKey === "") return null;
  if (data.status !== "completed" && data.status !== "failed") return null;
  if (idempotencyKey !== `${data.jobId}:${event}`) return null;

  const url = isRecord(data.result) ? data.result.documentUrl : undefined;
  const code = isRecord(data.error) ? data.error.code : undefined;
  return {
    event,
    jobId: data.jobId,
    status: data.status,
    requestIdempotencyKey: data.requestIdempotencyKey,
    documentUrl: typeof url === "string" && /^https?:\/\//.test(url) ? url : null,
    errorCode: typeof code === "string" ? code : null,
  };
}

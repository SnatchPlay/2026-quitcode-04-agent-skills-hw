# Шаблони коду (Next.js 16.3.5)

Ці файли зібрано (`next build`), пролінтовано й прогнано з моком n8n у копії проєкту: форма відповідає
одразу, мок отримує `/webhook/quote-request` з `auth=ok idempotency=new`, підписаний колбек → 202, статус
`processing → ready`; `scripts/check-contract.mjs` на них — 0 FAIL; `scripts/send-signed-callback.mjs` —
усі випадки як очікувано. Беріть як є і змінюйте лише позначене «під проєкт».

Файли: `lib/n8n/client.ts` (виклик n8n) · `lib/n8n/callback.ts` (ключі колбеків і розбір тіла) ·
`app/api/n8n/[event]/route.ts` (колбек) · приклад фічі `quote-request`: `lib/quotes.ts` і
`app/quotes/actions.ts` · подія «до відома» `lead-created` · `.env.example`.

## 1. `lib/n8n/client.ts` — єдине місце, де є `fetch` до n8n

- `async: true` — Respond to Webhook: успіх лише `202` з `job_id`; `async: false` — Immediately: успіх `2xx`.
- Повтори лише на мережеву помилку, таймаут і 5xx; той самий `idempotency-key`.
- Немає змінної середовища → жодної спроби, `{ ok: false, reason: "misconfigured" }` — запис стане `failed`, а не зависне в `queued`.

```ts
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
```

## 2. `lib/n8n/callback.ts` — ключі колбеків і розбір тіла після перевірки підпису

Сховище ключів тут — пам'ять процесу (демо). У продакшні — таблиця з унікальним обмеженням на ключ.
`readRawBody` читає `request.body` потоком і обриває на ліміті — chunked-запит без `content-length` не
буферизується цілком.

```ts
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
```

## 3. `app/api/n8n/[event]/route.ts` — колбек (порядок — `callback-route.md`)

Під проєкт: `HANDLERS` — одна функція на подію.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { claimCallbackKey, parseCallback, readRawBody, releaseCallbackKey, type N8nCallback } from "@/lib/n8n/callback";
import { applyQuoteCallback } from "@/lib/quotes";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;

type CallbackHandler = (callback: N8nCallback) => Promise<"stored" | "unknown-request">;

const HANDLERS: Record<string, CallbackHandler> = {
  "quote-request": applyQuoteCallback,
};

const reply = (status: number, body: Record<string, unknown> = {}) => Response.json(body, { status });

function signatureMatches(timestamp: string, raw: string, header: string | null): boolean {
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (!secret) throw new Error("N8N_CALLBACK_SECRET is not set");
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"));
  const received = Buffer.from(header.slice("sha256=".length));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request, context: RouteContext<"/api/n8n/[event]">) {
  const { event } = await context.params;
  const correlation = request.headers.get("x-correlation-id") ?? "-";
  const handler = Object.hasOwn(HANDLERS, event) ? HANDLERS[event] : undefined;
  if (!handler) return reply(404);

  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return reply(415);
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return reply(413);

  const raw = await readRawBody(request, MAX_BODY_BYTES);
  if (raw === null) return reply(413);
  const bytes = Buffer.byteLength(raw, "utf8");

  const timestamp = request.headers.get("x-n8n-timestamp") ?? "";
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!/^\d+$/.test(timestamp) || skew > MAX_CLOCK_SKEW_SECONDS) return reply(401);
  if (!signatureMatches(timestamp, raw, request.headers.get("x-n8n-signature"))) return reply(401);

  const key = request.headers.get("idempotency-key");
  if (!key) return reply(400);
  if (!claimCallbackKey(key)) return reply(200, { duplicate: true });

  let status = 202;
  try {
    const callback = parseCallback(raw, event, key);
    if (!callback) status = 400;
    else if ((await handler(callback)) === "unknown-request") status = 404;
  } catch (error) {
    status = 500;
    console.error(`n8n in event=${event} correlation=${correlation} failed`, error instanceof Error ? error.name : "error");
  }
  if (status !== 202) releaseCallbackKey(key);
  console.info(`n8n in event=${event} correlation=${correlation} result=${status} bytes=${bytes}`);
  return status === 202 ? reply(202, { ok: true }) : reply(status);
}
```

## 4. Приклад фічі: `lib/quotes.ts`

Запис знаходимо за `requestIdempotencyKey` з колбека, бо колбек може випередити збереження `jobId`;
`ready` і `failed` від самого n8n не перезаписуються, а `failed` з боку тригера (таймаути) пізній підписаний колбек
ще може виправити; `recordTriggerResult` не повертає `ready` назад у `processing`. Id — `randomUUID()`, а `getQuoteStatus` віддає лише статус і посилання (без email).

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { N8nCallback } from "@/lib/n8n/callback";
import type { TriggerResult } from "@/lib/n8n/client";

export type QuoteStatus = "queued" | "processing" | "ready" | "failed";

export type QuoteRequest = {
  id: string;
  company: string;
  email: string;
  description: string;
  budget: number | null;
  status: QuoteStatus;
  idempotencyKey: string;
  correlationId: string;
  jobId: string | null;
  documentUrl: string | null;
  createdAt: string;
};

declare global {
  var quoteRequests: Map<string, QuoteRequest> | undefined;
}

// Demo store for one process; production keeps quotes in the database.
const quotes = (globalThis.quoteRequests ??= new Map<string, QuoteRequest>());

export async function createQuoteRequest(input: Pick<QuoteRequest, "company" | "email" | "description" | "budget">) {
  const quote: QuoteRequest = {
    ...input,
    id: randomUUID(),
    status: "queued",
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
    jobId: null,
    documentUrl: null,
    createdAt: new Date().toISOString(),
  };
  quotes.set(quote.id, quote);
  return quote;
}

export async function getQuoteStatus(id: string) {
  const quote = quotes.get(id);
  return quote ? { id: quote.id, status: quote.status, documentUrl: quote.documentUrl } : null;
}

export async function recordTriggerResult(id: string, result: TriggerResult) {
  const quote = quotes.get(id);
  if (!quote || quote.status !== "queued") return;
  if (result.ok) {
    quote.status = "processing";
    quote.jobId = result.jobId;
  } else {
    quote.status = "failed";
  }
}

export async function applyQuoteCallback(callback: N8nCallback): Promise<"stored" | "unknown-request"> {
  const quote = [...quotes.values()].find((q) => q.idempotencyKey === callback.requestIdempotencyKey);
  if (!quote || (quote.jobId !== null && quote.jobId !== callback.jobId)) return "unknown-request";
  // Only a result from n8n is final: a trigger-side "failed" (timeouts) may still get a late signed callback.
  if (quote.status === "ready" || (quote.status === "failed" && quote.jobId !== null)) return "stored";
  quote.jobId = callback.jobId;
  quote.status = callback.status === "completed" && callback.documentUrl ? "ready" : "failed";
  quote.documentUrl = callback.documentUrl;
  return "stored";
}
```

## 5. Приклад фічі: `app/quotes/actions.ts` — дія не чекає n8n

Публічна форма: сесії немає, тому дія сама валідує й обмежує кожне поле (скіл форм команди); n8n отримує лише
потрібне воркфлоу (без email).

```ts
"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { triggerWorkflow } from "@/lib/n8n/client";
import { createQuoteRequest, recordTriggerResult } from "@/lib/quotes";

export type QuoteFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<"company" | "email" | "description" | "budget", string>>; values: Record<string, string> };

// Public form: there is no session to check, so the action validates and bounds every field itself.
export async function requestQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
  };
  const values = { company: field("company"), email: field("email"), description: field("description"), budget: field("budget") };
  const errors: Partial<Record<"company" | "email" | "description" | "budget", string>> = {};
  if (!values.company || values.company.length > 120) errors.company = "Вкажіть компанію (до 120 символів)";
  if (values.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Перевірте email";
  if (values.description.length < 10 || values.description.length > 2000) errors.description = "Опишіть задачу: від 10 до 2000 символів";
  const budget = values.budget === "" ? null : Number(values.budget.replace(/\s/g, ""));
  if (budget !== null && (!Number.isInteger(budget) || budget < 0)) errors.budget = "Бюджет — ціле число доларів";
  if (Object.keys(errors).length > 0) return { status: "invalid", errors, values };

  const quote = await createQuoteRequest({
    company: values.company,
    email: values.email,
    description: values.description,
    budget,
  });

  after(async () => {
    const result = await triggerWorkflow({
      event: "quote-request",
      data: { quoteId: quote.id, company: quote.company, description: quote.description, budget: quote.budget },
      idempotencyKey: quote.idempotencyKey,
      correlationId: quote.correlationId,
      async: true,
    });
    await recordTriggerResult(quote.id, result);
  });

  redirect(`/quotes/${quote.id}`);
}
```

Статус-сторінка `app/quotes/[id]/page.tsx` викликає `getQuoteStatus(id)` → `notFound()` для невідомого id;
поки `queued`/`processing` — `<meta httpEquiv="refresh" content="5" />`.

## 6. Подія «до відома» (`lead-created`, режим Immediately) у наявній дії

Ключ — UUID, створений один раз у дії й однаковий в усіх спробах. Аудит — в окремому `after()`, щоб збій
чи повтори n8n його не затримували і не губили.

```ts
  const idempotencyKey = randomUUID();
  after(() => logAudit("lead.created", lead.id));
  after(() =>
    triggerWorkflow({
      event: "lead-created",
      data: { leadId: lead.id, company: lead.company, budget: lead.budget, source: lead.source },
      idempotencyKey,
      correlationId: randomUUID(),
      async: false,
    }),
  );

```

## 7. `.env.example`

```bash
# LeadDesk local settings. Copy this file to .env.local and adjust it there.
# .env* files are git-ignored (except this example), so real values never reach git.

# Base of the n8n production webhook URLs (events: lead-created, quote-request).
# Locally it points at the offline n8n mock: node tools/mock-n8n.mjs
N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook
# Header Auth value (x-n8n-token) and the HMAC secret for signed callbacks.
# Generate: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
N8N_WEBHOOK_TOKEN=change-me-webhook-token
N8N_CALLBACK_SECRET=change-me-callback-secret
# Where n8n sends callbacks (POST /api/n8n/<event>).
APP_BASE_URL=http://127.0.0.1:3000
```

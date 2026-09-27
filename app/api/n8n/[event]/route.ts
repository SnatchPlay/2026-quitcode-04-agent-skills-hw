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

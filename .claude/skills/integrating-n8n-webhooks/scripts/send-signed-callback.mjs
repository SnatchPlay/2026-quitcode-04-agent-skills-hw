#!/usr/bin/env node
// Sends a matrix of signed and tampered n8n callbacks to a running app and checks the status codes.
// Node built-ins only. Reads N8N_CALLBACK_SECRET from the environment; never prints it.
import { createHmac, randomUUID } from "node:crypto";

const HELP = `send-signed-callback.mjs — callback matrix against a running Next.js app

Usage:
  node --env-file=.env.local send-signed-callback.mjs --url <callback url> [--job-id <id> --request-key <key>]

  --url <url>            e.g. http://127.0.0.1:3000/api/n8n/quote-request
  --event <name>         event in the body (default: <last path segment>.completed)
  --job-id <id>          jobId of a real request (from the mock log / the record)
  --request-key <key>    idempotency-key the app sent to n8n for that request
                         Without both, the "valid" case expects 404 (no such request).
  -h, --help             this help

Needs N8N_CALLBACK_SECRET in the environment (same value as the app).
Cases: valid, duplicate, wrong signature, missing signature, expired (-301 s), future (+301 s),
body reformatted after signing, key not bound to the body, wrong content-type, unknown event,
body over 64 KB. Exit code 1 if any case gets an unexpected status.`;

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "-h" || argv[i] === "--help") {
    console.log(HELP);
    process.exit(0);
  }
  const key = argv[i].replace(/^--/, "");
  if (!["url", "event", "job-id", "request-key"].includes(key) || argv[i + 1] === undefined) {
    console.error(`Unknown or incomplete argument: ${argv[i]}\n\n${HELP}`);
    process.exit(2);
  }
  opt[key] = argv[++i];
}
const secret = process.env.N8N_CALLBACK_SECRET;
if (!opt.url || !secret) {
  console.error(!opt.url ? "--url is required" : "N8N_CALLBACK_SECRET is not set (run with node --env-file=.env.local)");
  process.exit(2);
}

const url = new URL(opt.url);
const pathEvent = url.pathname.split("/").filter(Boolean).pop();
const event = opt.event ?? `${pathEvent}.completed`;
const real = Boolean(opt["job-id"] && opt["request-key"]);
const jobId = opt["job-id"] ?? randomUUID();
const requestKey = opt["request-key"] ?? randomUUID();
const now = () => Math.floor(Date.now() / 1000);

const bodyFor = (id = jobId, ev = event) =>
  JSON.stringify({
    version: 1,
    event: ev,
    data: {
      jobId: id,
      status: "completed",
      correlationId: randomUUID(),
      requestIdempotencyKey: requestKey,
      result: { documentUrl: `https://files.example.test/n8n/${id}.pdf` },
      completedAt: new Date().toISOString(),
    },
  });
const sign = (ts, raw) => `sha256=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;

async function send({ target = url, raw, ts = now(), signature, key, type = "application/json" }) {
  const headers = { "content-type": type, "x-n8n-timestamp": String(ts), "x-correlation-id": randomUUID() };
  const sig = signature === undefined ? sign(ts, raw) : signature;
  if (sig !== null) headers["x-n8n-signature"] = sig;
  headers["idempotency-key"] = key ?? `${JSON.parse(raw).data.jobId}:${JSON.parse(raw).event}`;
  const res = await fetch(target, { method: "POST", headers, body: raw, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  await res.arrayBuffer();
  return res.status;
}

const valid = bodyFor();
const unknownPath = new URL(url);
unknownPath.pathname = url.pathname.replace(/[^/]+$/, "no-such-event");
const huge = JSON.stringify({ ...JSON.parse(bodyFor(randomUUID())), pad: "x".repeat(70 * 1024) });

const cases = [
  ["valid signed callback", real ? 202 : 404, () => send({ raw: valid })],
  ["same callback again (Retry On Fail)", real ? 200 : 404, () => send({ raw: valid })],
  ["wrong signature", 401, () => send({ raw: bodyFor(randomUUID()), signature: `sha256=${"0".repeat(64)}` })],
  ["missing signature", 401, () => send({ raw: bodyFor(randomUUID()), signature: null })],
  ["timestamp 301 s in the past", 401, () => { const ts = now() - 301; const raw = bodyFor(randomUUID()); return send({ raw, ts, signature: sign(ts, raw) }); }],
  ["timestamp 301 s in the future", 401, () => { const ts = now() + 301; const raw = bodyFor(randomUUID()); return send({ raw, ts, signature: sign(ts, raw) }); }],
  ["body reformatted after signing", 401, () => { const ts = now(); const raw = bodyFor(randomUUID()); return send({ raw: JSON.stringify(JSON.parse(raw), null, 2), ts, signature: sign(ts, raw), key: `${JSON.parse(raw).data.jobId}:${event}` }); }],
  ["idempotency-key not bound to the body", 400, () => send({ raw: bodyFor(randomUUID()), key: `${randomUUID()}:${event}` })],
  ["content-type text/plain", 415, () => send({ raw: bodyFor(randomUUID()), type: "text/plain" })],
  ["unknown event in the path", 404, () => send({ target: unknownPath, raw: bodyFor(randomUUID()) })],
  ["body over 64 KB", 413, () => send({ raw: huge })],
];

let failed = 0;
console.log(`callback matrix -> ${url.origin}${url.pathname} (event ${event}; ${real ? "real request" : "no real request: valid case expects 404"})`);
for (const [name, expected, run] of cases) {
  let got;
  try {
    got = await run();
  } catch (error) {
    got = error instanceof Error ? error.name : "error";
  }
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(40)} expected ${expected}, got ${got}`);
}
console.log(failed ? `${failed} case(s) with an unexpected status` : "all cases as expected");
process.exit(failed ? 1 : 0);

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
  if (quote.status === "ready" || quote.status === "failed") return "stored";
  quote.jobId = callback.jobId;
  quote.status = callback.status === "completed" && callback.documentUrl ? "ready" : "failed";
  quote.documentUrl = callback.documentUrl;
  return "stored";
}

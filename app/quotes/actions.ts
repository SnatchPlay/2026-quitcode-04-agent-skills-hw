"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { triggerWorkflow } from "@/lib/n8n/client";
import { createQuoteRequest, recordTriggerResult } from "@/lib/quotes";

export type QuoteFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<"company" | "email" | "description" | "budget", string>>; values: Record<string, string> };

export async function requestQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const values = { company: field("company"), email: field("email"), description: field("description"), budget: field("budget") };
  const errors: Partial<Record<"company" | "email" | "description" | "budget", string>> = {};
  if (!values.company) errors.company = "Вкажіть компанію";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Перевірте email";
  if (values.description.length < 10) errors.description = "Опишіть задачу хоча б одним реченням";
  const budget = values.budget === "" ? null : Number(values.budget);
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

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

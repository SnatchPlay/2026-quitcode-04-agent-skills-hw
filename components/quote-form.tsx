"use client";

import { useActionState } from "react";
import { requestQuote, type QuoteFormState } from "@/app/quotes/actions";

const initialState: QuoteFormState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

type Field = "company" | "email" | "description" | "budget";

export function QuoteForm() {
  const [state, formAction, pending] = useActionState(requestQuote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" ? state.values : {};

  const describe = (field: Field) =>
    errors[field] ? { "aria-invalid": true, "aria-describedby": `quote-${field}-error` } : {};
  const error = (field: Field) =>
    errors[field] && (
      <span id={`quote-${field}-error`} className="mt-1 block text-xs text-red-600">
        {errors[field]}
      </span>
    );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "invalid" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Перевірте поля, позначені нижче.
        </p>
      )}

      <div>
        <label htmlFor="quote-company" className="block text-sm font-medium">
          Компанія
        </label>
        <input id="quote-company" name="company" autoComplete="organization" defaultValue={values.company} className={inputClass} {...describe("company")} />
        {error("company")}
      </div>

      <div>
        <label htmlFor="quote-email" className="block text-sm font-medium">
          Email
        </label>
        <input id="quote-email" name="email" type="email" autoComplete="email" defaultValue={values.email} className={inputClass} {...describe("email")} />
        {error("email")}
      </div>

      <div>
        <label htmlFor="quote-description" className="block text-sm font-medium">
          Опис задачі
        </label>
        <textarea id="quote-description" name="description" rows={5} defaultValue={values.description} className={inputClass} {...describe("description")} />
        {error("description")}
      </div>

      <div>
        <label htmlFor="quote-budget" className="block text-sm font-medium">
          Бюджет, $
        </label>
        <input id="quote-budget" name="budget" type="number" min={0} step={1} defaultValue={values.budget} className={inputClass} {...describe("budget")} />
        {error("budget")}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Надсилаємо…" : "Надіслати запит на кошторис"}
      </button>
    </form>
  );
}

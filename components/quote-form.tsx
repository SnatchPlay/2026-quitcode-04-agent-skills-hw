"use client";

import { useActionState } from "react";
import { requestQuote, type QuoteFormState } from "@/app/quotes/actions";

const initialState: QuoteFormState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function QuoteForm() {
  const [state, formAction, pending] = useActionState(requestQuote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" ? state.values : {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <label className="block text-sm font-medium">
        Компанія
        <input name="company" autoComplete="organization" defaultValue={values.company} className={inputClass} />
        {errors.company && <span className="mt-1 block text-xs text-red-600">{errors.company}</span>}
      </label>

      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={values.email} className={inputClass} />
        {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email}</span>}
      </label>

      <label className="block text-sm font-medium">
        Опис задачі
        <textarea name="description" rows={5} defaultValue={values.description} className={inputClass} />
        {errors.description && <span className="mt-1 block text-xs text-red-600">{errors.description}</span>}
      </label>

      <label className="block text-sm font-medium">
        Бюджет, $
        <input name="budget" type="number" min={0} step={1} defaultValue={values.budget} className={inputClass} />
        {errors.budget && <span className="mt-1 block text-xs text-red-600">{errors.budget}</span>}
      </label>

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

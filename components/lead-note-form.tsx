"use client";

import { useActionState } from "react";
import { addNote, type AddNoteState } from "@/app/actions";
import { NOTE_MAX_LENGTH } from "@/lib/types";

const initialState: AddNoteState = { status: "idle" };

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addNote, initialState);
  const error = state.status === "invalid" ? state.errors.text : undefined;
  const values = state.status === "invalid" ? state.values : undefined;

  return (
    <form action={formAction} className="space-y-2" noValidate>
      <input type="hidden" name="leadId" value={leadId} />
      {error && (
        <p role="alert" className="text-xs text-red-600">
          Перевірте поле, позначене нижче.
        </p>
      )}

      <label htmlFor="note-text" className="block text-sm font-medium">
        Додати нотатку
      </label>
      <textarea
        id="note-text"
        name="text"
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        defaultValue={values?.text}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "note-text-error" : "note-text-hint"}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {error ? (
        <p id="note-text-error" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p id="note-text-hint" className="text-xs text-slate-500">
          До {NOTE_MAX_LENGTH} символів.
        </p>
      )}

      {state.status === "ok" && (
        <p role="status" className="text-xs text-slate-600">
          Нотатку додано.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Надсилаємо…" : "Додати нотатку"}
      </button>
    </form>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteStatus, type QuoteStatus } from "@/lib/quotes";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  queued: "У черзі",
  processing: "Готуємо кошторис…",
  ready: "Кошторис готовий",
  failed: "Не вдалося підготувати кошторис",
};

export default async function QuoteStatusPage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const quote = await getQuoteStatus(id);
  if (!quote) notFound();

  const isPending = quote.status === "queued" || quote.status === "processing";

  return (
    <div className="flex flex-1 flex-col">
      {isPending && <meta httpEquiv="refresh" content="5" />}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Studio Nova
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Запит на кошторис #{quote.id.slice(0, 8)}</h1>
          <p className="mt-2 text-slate-600">{STATUS_LABEL[quote.status]}</p>

          {isPending && <p className="mt-4 text-sm text-slate-500">Сторінка оновлюється автоматично.</p>}

          {quote.status === "ready" && quote.documentUrl && (
            <a
              href={quote.documentUrl}
              className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Завантажити кошторис (PDF)
            </a>
          )}

          {quote.status === "failed" && (
            <p className="mt-4 text-sm text-slate-500">
              Спробуйте надіслати запит ще раз або зв&apos;яжіться з нами напряму.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

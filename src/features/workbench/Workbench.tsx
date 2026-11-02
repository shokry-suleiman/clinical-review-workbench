import { DocumentReview } from "@/features/document-review/DocumentReview";

export function Workbench() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3.5 sm:px-8">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white"
          >
            CR
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-ink">
              Clinical Review Workbench
            </span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Clinical document review
            </span>
          </span>
        </div>
      </header>

      <main
        className="mx-auto max-w-[1440px] px-4 pb-10 pt-24 sm:px-8 sm:pt-28"
        id="main-content"
      >
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Review workspace
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">
              Clinical document review
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
              Inspect extracted findings against their source, then decide what
              to accept, edit, or reject.
            </p>
          </div>
        </div>

        <DocumentReview />
      </main>
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { DocumentReview } from "@/features/document-review/DocumentReview";
import { PatientContext } from "@/features/patient-context/PatientContext";
import type { ConfirmedFinding } from "@/features/document-review/review-state";

export function Workbench() {
  const [confirmedFindings, setConfirmedFindings] = useState<
    ConfirmedFinding[]
  >([]);
  const handleConfirmedChange = useCallback(
    (findings: ConfirmedFinding[]) => setConfirmedFindings(findings),
    [],
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <a
            aria-label="Clinical Review Workbench home"
            className="flex min-w-0 items-center gap-3 rounded-md"
            href="#main-content"
          >
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
                Human review · synthetic data
              </span>
            </span>
          </a>

          <nav aria-label="Main navigation" className="hidden items-center gap-5 sm:flex">
            <a
              className="rounded text-sm font-medium text-muted hover:text-primary"
              href="#patient-context"
            >
              Patient context
            </a>
            <a
              className="rounded text-sm font-medium text-muted hover:text-primary"
              href="#document-review"
            >
              Document review
            </a>
          </nav>

          <span className="shrink-0 rounded-full border border-warning/20 bg-warning-surface px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-warning sm:px-3 sm:text-[11px]">
            Demo environment
          </span>
        </div>
      </header>

      <main
        className="mx-auto max-w-[1440px] px-4 pb-10 pt-7 sm:px-8 sm:pt-9"
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
              Inspect draft suggestions against their source, then decide what
              belongs in the patient context.
            </p>
          </div>
          <p className="max-w-sm rounded-lg border border-border bg-white px-3 py-2 text-xs leading-5 text-muted">
            Synthetic fixtures only. No real report, PHI, or external AI
            integration is enabled.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <PatientContext confirmedFindings={confirmedFindings} />
          <DocumentReview onConfirmedChange={handleConfirmedChange} />
        </div>

        <footer className="mt-6 flex flex-col gap-1 border-t border-border pt-4 text-xs leading-5 text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Interview demonstration · all names and documents are fictional.</p>
          <p>Drafts are not patient information until a reviewer accepts them.</p>
        </footer>
      </main>
    </div>
  );
}

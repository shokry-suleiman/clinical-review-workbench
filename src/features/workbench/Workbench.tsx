"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocumentReview } from "@/features/document-review/review/DocumentReview";
import { MESSAGES, type Language } from "@/shared/language";

export function Workbench() {
  const [language, setLanguage] = useState<Language>("en");
  const message = MESSAGES[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
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
                {message.brandSubtitle}
              </span>
            </span>
          </div>
          <nav aria-label="Primary navigation" className="flex items-center gap-3">
            <Link className="text-sm font-medium text-primary hover:underline" href="/">
              {message.reviewNav}
            </Link>
            <Link className="text-sm font-medium text-primary hover:underline" href="/eval">
              {message.evalSetNav}
            </Link>
            <Link className="text-sm font-medium text-primary hover:underline" href="/evaluation">
              {message.evaluationNav}
            </Link>
            <label className="sr-only" htmlFor="language-select">
              {message.language}
            </label>
            <select
              className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-ink"
              id="language-select"
              onChange={(event) => {
                const nextLanguage = event.currentTarget.value;
                if (nextLanguage === "en" || nextLanguage === "de") {
                  setLanguage(nextLanguage);
                }
              }}
              value={language}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </nav>
        </div>
      </header>

      <main
        className="mx-auto max-w-[1440px] px-4 pb-10 pt-32 sm:px-8 sm:pt-28"
        id="main-content"
      >
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {message.workspace}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">
            {message.pageTitle}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
            {message.pageLead}
          </p>
        </div>

        <DocumentReview language={language} />
      </main>
    </div>
  );
}

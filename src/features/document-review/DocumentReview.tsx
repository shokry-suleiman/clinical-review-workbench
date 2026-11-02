"use client";

import { useEffect, useReducer, useState } from "react";
import type { ChangeEvent } from "react";
import {
  ScenarioSchema,
  type ExtractionField,
  type Scenario,
} from "./contracts";
import {
  extractFindings,
  type ExtractionService,
} from "./extraction-service";
import {
  getConfirmedFindings,
  reviewReducer,
  type ConfirmedFinding,
} from "./review-state";
import { SYNTHETIC_SOURCE_DOCUMENT } from "./source-document";

const FIELD_LABELS: Record<ExtractionField, string> = {
  follow_up: "Follow-up",
  visit_preparation: "Visit preparation",
};

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "valid", label: "Valid response · 2 findings" },
  { value: "partial", label: "Partial response · 1 finding" },
  { value: "malformed", label: "Malformed response · validation check" },
  { value: "service-failure", label: "Service failure · retry" },
];

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type PendingUpload = {
  fileName: string;
  text: string;
};

const MAX_UPLOAD_BYTES = 50_000;

function getStatusLabel(status: "draft" | "accepted" | "rejected") {
  if (status === "accepted") return "Accepted · clinician reviewed";
  if (status === "rejected") return "Rejected · not added to patient context";
  return "Draft · needs clinician review";
}

export function DocumentReview({
  onConfirmedChange,
  extractFindings: runExtraction = extractFindings,
}: {
  onConfirmedChange: (findings: ConfirmedFinding[]) => void;
  extractFindings?: ExtractionService;
}) {
  const [scenario, setScenario] = useState<Scenario>("valid");
  const [retryKey, setRetryKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [findings, dispatch] = useReducer(reviewReducer, []);
  const [documentText, setDocumentText] = useState(
    SYNTHETIC_SOURCE_DOCUMENT.text,
  );
  const [documentName, setDocumentName] = useState<string>(
    SYNTHETIC_SOURCE_DOCUMENT.title,
  );
  const [isUploadedDocument, setIsUploadedDocument] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [syntheticConfirmed, setSyntheticConfirmed] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function beginScenario(nextScenario: Scenario) {
    setScenario(nextScenario);
    setDocumentText(SYNTHETIC_SOURCE_DOCUMENT.text);
    setDocumentName(SYNTHETIC_SOURCE_DOCUMENT.title);
    setIsUploadedDocument(false);
    setPendingUpload(null);
    setSyntheticConfirmed(false);
    setUploadError(null);
    setLoadState({ status: "loading" });
    dispatch({ type: "load", findings: [] });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setPendingUpload(null);
    setSyntheticConfirmed(false);
    setUploadError(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setUploadError(
        "Choose a plain-text .txt file. Other formats are not supported.",
      );
      return;
    }

    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Choose a non-empty .txt file no larger than 50 KB.");
      return;
    }

    try {
      const text = await file.text();
      if (text.trim().length === 0) {
        setUploadError("The selected text file is empty.");
        return;
      }
      setPendingUpload({ fileName: file.name, text });
    } catch {
      setUploadError("The selected text file could not be read.");
    }
  }

  function analyzeUpload() {
    if (!pendingUpload || !syntheticConfirmed) return;
    setScenario("valid");
    setDocumentText(pendingUpload.text);
    setDocumentName(pendingUpload.fileName);
    setIsUploadedDocument(true);
    setLoadState({ status: "loading" });
    setUploadError(null);
    dispatch({ type: "load", findings: [] });
    setRetryKey((current) => current + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void runExtraction(
      scenario,
      controller.signal,
      isUploadedDocument ? documentText : undefined,
    )
      .then((response) => {
        if (!active) return;
        dispatch({ type: "load", findings: response.findings });
        setLoadState({ status: "ready" });
      })
      .catch((error: unknown) => {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setLoadState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The extraction response could not be loaded.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    documentText,
    runExtraction,
    isUploadedDocument,
    retryKey,
    scenario,
  ]);

  useEffect(() => {
    onConfirmedChange(getConfirmedFindings(findings));
  }, [findings, onConfirmedChange]);

  return (
    <section
      aria-busy={loadState.status === "loading"}
      aria-labelledby="document-review-heading"
      className="rounded-2xl border border-border bg-panel shadow-[0_2px_8px_rgba(27,61,51,0.035)]"
      id="document-review"
    >
      <div className="border-b border-border p-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
              Document review
            </p>
            <h2
              className="mt-1 text-xl font-semibold tracking-tight text-ink"
              id="document-review-heading"
            >
              Review extracted drafts
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
              Compare each draft with its exact source evidence. Nothing is
              confirmed without your review.
            </p>
          </div>
          <div className="w-full sm:w-64">
            <label
              className="mb-1.5 block text-xs font-semibold text-ink"
              htmlFor="mock-scenario"
            >
              Built-in mock response
            </label>
            <select
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink shadow-sm focus:border-primary"
              id="mock-scenario"
              onChange={(event) => {
                const nextScenario = ScenarioSchema.safeParse(
                  event.currentTarget.value,
                );
                if (nextScenario.success) beginScenario(nextScenario.data);
              }}
              value={scenario}
            >
              {SCENARIOS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-4 text-muted">
              Applies to the fictional sample only. Uploaded files use Gemini.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[0.88fr_1.12fr]">
        <section
          aria-labelledby="source-document-heading"
          className="min-w-0"
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              className="text-sm font-semibold text-ink"
              id="source-document-heading"
            >
              Source document
            </h3>
            <span className="rounded-md bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
              {isUploadedDocument ? "Synthetic upload" : "Synthetic sample"}
            </span>
          </div>
          <article className="mt-3 rounded-xl border border-border bg-[#fbfcfb] p-4 sm:p-5">
            <div className="flex items-start gap-3 border-b border-border pb-3">
              <div
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e7f1ed] text-sm font-bold text-primary"
              >
                N
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {documentName}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {isUploadedDocument
                    ? "Uploaded text · sent to Gemini; not retained by this app"
                    : "Demo document · Fictional patient"}
                </p>
              </div>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words pt-4 font-sans text-sm leading-6 text-[#4c615c]">
              {documentText}
            </pre>
          </article>
          <p className="mt-3 text-xs leading-5 text-muted">
            Evidence excerpts are matched against the exact displayed document
            text.
          </p>

          <div className="mt-4 rounded-xl border border-border bg-surface p-4">
            <h4 className="text-sm font-semibold text-ink">
              Try a synthetic text upload
            </h4>
            <p className="mt-1 text-xs leading-5 text-muted">
              Plain-text .txt only · maximum 50 KB. Analysis sends the text to
              Google Gemini.
            </p>
            <a
              className="mt-1 inline-block rounded text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
              download
              href="/fictional-visit.txt"
            >
              Download a fictional sample
            </a>
            <p className="mt-2 text-xs leading-5 text-warning">
              Google&apos;s free tier may use submitted content to improve its
              products. Synthetic documents only—never upload real patient
              records or PHI.
            </p>
            <label
              className="mt-3 block text-xs font-semibold text-ink"
              htmlFor="synthetic-document-upload"
            >
              Choose a synthetic document
            </label>
            <input
              accept=".txt,text/plain"
              className="mt-1.5 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
              id="synthetic-document-upload"
              onChange={(event) => void handleFileChange(event)}
              type="file"
            />
            {pendingUpload ? (
              <p className="mt-2 break-all text-xs text-muted">
                Selected: {pendingUpload.fileName}
              </p>
            ) : null}
            <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink">
              <input
                checked={syntheticConfirmed}
                className="mt-1 size-4 shrink-0 accent-primary"
                onChange={(event) =>
                  setSyntheticConfirmed(event.currentTarget.checked)
                }
                type="checkbox"
              />
              <span>
                I confirm this file is fictional and contains no real patient
                information.
              </span>
            </label>
            {uploadError ? (
              <p className="mt-2 text-xs font-medium text-negative" role="alert">
                {uploadError}
              </p>
            ) : null}
            <button
              className="mt-3 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                !pendingUpload ||
                !syntheticConfirmed ||
                loadState.status === "loading"
              }
              onClick={analyzeUpload}
              type="button"
            >
              Analyze with Gemini
            </button>
          </div>
        </section>

        <section aria-labelledby="draft-findings-heading" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3
              className="text-sm font-semibold text-ink"
              id="draft-findings-heading"
            >
              Draft findings
            </h3>
            <span className="text-xs text-muted">
              {findings.length} {findings.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="mt-3">
            <p aria-live="polite" className="sr-only">
              {loadState.status === "loading"
                ? isUploadedDocument
                  ? "Sending synthetic document for Gemini extraction."
                  : "Loading the selected built-in mock response."
                : loadState.status === "ready"
                  ? `${findings.length} draft findings loaded.`
                  : ""}
            </p>
            {loadState.status === "loading" ? (
              <div className="rounded-xl border border-border bg-surface px-4 py-5 text-sm text-muted">
                {isUploadedDocument
                  ? "Analyzing the synthetic document with Gemini…"
                  : "Loading the selected mock response…"}
              </div>
            ) : null}
            {loadState.status === "error" ? (
              <div
                className="rounded-xl border border-negative/25 bg-negative-surface p-4"
                role="alert"
              >
                <p className="text-sm font-semibold text-negative">
                  Unable to load safe draft findings
                </p>
                <p className="mt-1 text-sm leading-5 text-ink">
                  {loadState.message}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Nothing from this response was added to patient context.
                </p>
                <button
                  className="mt-3 rounded-lg border border-negative/30 bg-white px-3 py-2 text-sm font-semibold text-negative hover:bg-negative-surface"
                  onClick={() => {
                    dispatch({ type: "load", findings: [] });
                    setLoadState({ status: "loading" });
                    setRetryKey((current) => current + 1);
                  }}
                  type="button"
                >
                  {isUploadedDocument
                    ? "Retry Gemini extraction"
                    : "Retry mock service"}
                </button>
              </div>
            ) : null}
            {loadState.status === "ready" && findings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm leading-5 text-muted">
                This response contains no findings to review.
              </div>
            ) : null}
            {loadState.status === "ready" && findings.length > 0 ? (
              <ul className="space-y-3">
                {findings.map((finding) => (
                  <li
                    className="rounded-xl border border-border bg-white p-4"
                    key={finding.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">
                        {FIELD_LABELS[finding.field]}
                      </p>
                      <span
                        className={
                          finding.status === "accepted"
                            ? "rounded-full border border-positive/20 bg-positive-surface px-2.5 py-1 text-[11px] font-semibold text-positive"
                            : finding.status === "rejected"
                              ? "rounded-full border border-negative/20 bg-negative-surface px-2.5 py-1 text-[11px] font-semibold text-negative"
                              : "rounded-full border border-warning/20 bg-warning-surface px-2.5 py-1 text-[11px] font-semibold text-warning"
                        }
                      >
                        {getStatusLabel(finding.status)}
                      </span>
                    </div>

                    {finding.status === "draft" ? (
                      <div className="mt-3">
                        <label
                          className="block text-xs font-semibold text-ink"
                          htmlFor={`finding-${finding.id}`}
                        >
                          Draft value · edit before review
                        </label>
                        <input
                          className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-primary"
                          id={`finding-${finding.id}`}
                          onChange={(event) =>
                            dispatch({
                              type: "edit",
                              id: finding.id,
                              value: event.currentTarget.value,
                            })
                          }
                          value={finding.editedValue}
                        />
                      </div>
                    ) : (
                      <div
                        className={
                          finding.status === "accepted"
                            ? "mt-3 rounded-lg bg-positive-surface px-3 py-2.5"
                            : "mt-3 rounded-lg bg-negative-surface px-3 py-2.5"
                        }
                      >
                        <p className="text-xs font-semibold text-muted">
                          {finding.status === "accepted"
                            ? "Clinician-reviewed value"
                            : "Rejected draft"}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-5 text-ink">
                          {finding.editedValue}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 rounded-lg border-l-2 border-primary/40 bg-surface px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                        Source evidence · {finding.sourceSection ?? "Document excerpt"}
                      </p>
                      <blockquote className="mt-1 text-sm leading-5 text-ink">
                        “{finding.sourceExcerpt}”
                      </blockquote>
                    </div>

                    {finding.status === "draft" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={finding.editedValue.trim().length === 0}
                          onClick={() =>
                            dispatch({ type: "accept", id: finding.id })
                          }
                          type="button"
                        >
                          Accept
                        </button>
                        <button
                          className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface"
                          onClick={() =>
                            dispatch({ type: "reject", id: finding.id })
                          }
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

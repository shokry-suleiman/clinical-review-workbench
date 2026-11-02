"use client";

import { useEffect, useReducer, useState } from "react";
import type { ChangeEvent } from "react";
import type { ExtractionField } from "./contracts";
import { extractFindings, type ExtractionService } from "./extraction-service";
import { reviewReducer } from "./review-state";
import type { ReviewFinding } from "./review-state";

const FIELD_LABELS: Record<ExtractionField, string> = {
  follow_up: "Follow-up",
  visit_preparation: "Visit preparation",
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type ReportState = "idle" | "generating" | "downloaded" | "error";
const MAX_UPLOAD_BYTES = 10_000_000;

function getStatusLabel(status: "draft" | "accepted" | "rejected") {
  if (status === "accepted") return "Accepted · clinician reviewed";
  if (status === "rejected") return "Rejected · not added to reviewed information";
  return "Draft · needs clinician review";
}

export function DocumentReview({
  extractFindings: runExtraction = extractFindings,
}: {
  extractFindings?: ExtractionService;
}) {
  const [retryKey, setRetryKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [findings, dispatch] = useReducer(reviewReducer, []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [authorizedToSend, setAuthorizedToSend] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(null);
    setDocumentText("");
    setAnalysisRequested(false);
    setAuthorizedToSend(false);
    setUploadError(null);
    setReportError(null);
    setReportState("idle");
    setLoadState({ status: "idle" });
    dispatch({ type: "load", findings: [] });
    if (!file) return;

    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      (file.type !== "" && file.type !== "application/pdf")
    ) {
      setUploadError("Choose a PDF document. Other file formats are not supported.");
      return;
    }

    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Choose a non-empty PDF no larger than 10 MB.");
      return;
    }

    setSelectedFile(file);
  }

  function analyzeDocument() {
    if (!selectedFile || !authorizedToSend) return;
    setDocumentText("");
    setAnalysisRequested(true);
    setLoadState({ status: "loading" });
    setUploadError(null);
    setReportError(null);
    setReportState("idle");
    dispatch({ type: "load", findings: [] });
    setRetryKey((current) => current + 1);
  }

  useEffect(() => {
    if (!analysisRequested || !selectedFile) return;

    const controller = new AbortController();
    let active = true;

    void runExtraction(selectedFile, controller.signal)
      .then((response) => {
        if (!active) return;
        setDocumentText(response.sourceText);
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
  }, [analysisRequested, retryKey, runExtraction, selectedFile]);

  async function generateAndDownloadPdf() {
    if (loadState.status !== "ready" || !selectedFile) return;
    setReportState("generating");
    setReportError(null);

    try {
      const { downloadReviewPdf } = await import("./pdf-report");
      await downloadReviewPdf(selectedFile.name, findings);
      setReportState("downloaded");
    } catch {
      setReportState("error");
      setReportError("The PDF could not be generated. Please try again.");
    }
  }

  const resultsReady = loadState.status === "ready";

  return (
    <div
      aria-busy={loadState.status === "loading" || reportState === "generating"}
      className="space-y-5"
      id="document-review"
    >
      <section
        aria-labelledby="document-review-heading"
        className="rounded-2xl border border-border bg-panel p-4 shadow-[0_2px_8px_rgba(27,61,51,0.035)] sm:p-6"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
          Document review
        </p>
        <h2
          className="mt-1 text-xl font-semibold tracking-tight text-ink"
          id="document-review-heading"
        >
          Review and export findings
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          Upload a PDF to extract findings, review them against source
          evidence, and download a report.
        </p>
        <p className="mt-3 rounded-lg border border-warning/20 bg-warning-surface px-3 py-2 text-sm font-medium leading-5 text-warning">
          Draft only. Human review is required; AI-generated findings are not
          confirmed information.
        </p>
      </section>

      <section
        aria-labelledby="upload-document-heading"
        className="rounded-2xl border border-border bg-panel p-4 shadow-[0_2px_8px_rgba(27,61,51,0.035)] sm:p-6"
      >
        <div className="mb-4">
          <h3
            className="text-base font-semibold text-ink"
            id="upload-document-heading"
          >
            Upload document
          </h3>
          <p className="mt-1 text-sm text-muted">
            Select a PDF and confirm authorization before analysis.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="sr-only" htmlFor="document-upload">
            Choose a PDF document
          </label>
          <input
            accept=".pdf,application/pdf"
            className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
            id="document-upload"
            onChange={handleFileChange}
            type="file"
          />
          <button
            className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 md:min-w-48"
            disabled={
              !selectedFile ||
              !authorizedToSend ||
              loadState.status === "loading"
            }
            onClick={analyzeDocument}
            type="button"
          >
            {loadState.status === "loading" ? (
              <>
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-white/40 border-t-white align-[-3px]"
                />
                Analyzing…
              </>
            ) : (
              "Analyze with Gemini"
            )}
          </button>
        </div>

        <p className="mt-2 text-xs leading-5 text-muted">
          PDF only · maximum 10 MB. Scanned PDFs without selectable text require
          OCR, which is not supported. The document is sent to Google Gemini
          through this application&apos;s server; Google&apos;s data handling
          terms apply.
        </p>
        {selectedFile ? (
          <p className="mt-2 break-all text-xs font-medium text-ink">
            Selected: {selectedFile.name} ·{" "}
            {(selectedFile.size / 1_000_000).toFixed(2)} MB
          </p>
        ) : null}
        <label
          className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink"
          htmlFor="authorized-to-send"
        >
          <input
            checked={authorizedToSend}
            className="mt-1 size-4 shrink-0 accent-primary"
            id="authorized-to-send"
            onChange={(event) =>
              setAuthorizedToSend(event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span>
            I confirm I am authorized to send this document to Google Gemini.
          </span>
        </label>
        {uploadError ? (
          <p className="mt-2 text-xs font-medium text-negative" role="alert">
            {uploadError}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="findings-stage-heading"
        className="rounded-2xl border border-border bg-panel p-4 shadow-[0_2px_8px_rgba(27,61,51,0.035)] sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="text-lg font-semibold text-ink"
              id="findings-stage-heading"
            >
              Review findings
            </h3>
            <p className="mt-1 text-sm text-muted">
              {resultsReady
                ? `${findings.length} ${findings.length === 1 ? "finding" : "findings"} extracted`
                : "Findings will appear here after analysis."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              className="flex items-center justify-center rounded-lg border border-primary px-3.5 py-2.5 text-sm font-semibold text-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!resultsReady || reportState === "generating"}
              onClick={() => void generateAndDownloadPdf()}
              type="button"
            >
              {reportState === "generating" ? (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
                  />
                  Generating PDF…
                </>
              ) : reportState === "downloaded" ? (
                "Download PDF again"
              ) : (
                "Generate PDF"
              )}
            </button>
            {reportState === "downloaded" ? (
              <p className="text-xs font-medium text-positive" role="status">
                PDF downloaded
              </p>
            ) : null}
            {reportError ? (
              <p className="text-xs font-medium text-negative" role="alert">
                {reportError}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          {loadState.status === "idle" ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm leading-5 text-muted">
              Extracted results will appear here.
            </p>
          ) : null}
          {loadState.status === "loading" ? (
            <p
              aria-live="polite"
              className="rounded-lg bg-surface px-3 py-5 text-center text-sm text-muted"
            >
              Waiting for Gemini results…
            </p>
          ) : null}
          {loadState.status === "error" ? (
            <div
              className="rounded-lg border border-negative/25 bg-negative-surface p-3"
              role="alert"
            >
              <p className="text-sm font-semibold text-negative">
                Analysis failed
              </p>
              <p className="mt-1 text-sm leading-5 text-ink">
                {loadState.message}
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
                Retry analysis
              </button>
            </div>
          ) : null}
          {resultsReady && findings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm leading-5 text-muted">
              No findings were returned for review.
            </p>
          ) : null}
          {resultsReady && findings.length > 0 ? (
            <ul className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {findings.map((finding) => (
                <li
                  className="rounded-lg border border-border bg-panel p-3"
                  key={finding.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">
                      {FIELD_LABELS[finding.field]}
                    </p>
                    <span
                      className={
                        finding.status === "accepted"
                          ? "rounded-full border border-positive/20 bg-positive-surface px-2 py-1 text-[10px] font-semibold text-positive"
                          : finding.status === "rejected"
                            ? "rounded-full border border-negative/20 bg-negative-surface px-2 py-1 text-[10px] font-semibold text-negative"
                            : "rounded-full border border-warning/20 bg-warning-surface px-2 py-1 text-[10px] font-semibold text-warning"
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
                        className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:border-primary"
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
                          ? "mt-3 rounded-lg bg-positive-surface px-3 py-2"
                          : "mt-3 rounded-lg bg-negative-surface px-3 py-2"
                      }
                    >
                      <p className="text-xs font-semibold text-muted">
                        {finding.status === "accepted"
                          ? "Clinician-reviewed value"
                          : "Rejected draft"}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-ink">
                        {finding.editedValue}
                      </p>
                    </div>
                  )}
                  <div className="mt-3 rounded-lg border-l-2 border-primary/40 bg-surface px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Source evidence
                      {finding.sourceSection
                        ? ` · ${finding.sourceSection}`
                        : ""}
                    </p>
                    <blockquote className="mt-1 text-sm leading-5 text-ink">
                      “{finding.sourceExcerpt}”
                    </blockquote>
                  </div>
                  {finding.status === "draft" ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={finding.editedValue.trim().length === 0}
                        onClick={() =>
                          dispatch({ type: "accept", id: finding.id })
                        }
                        type="button"
                      >
                        Accept
                      </button>
                      <button
                        className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
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
          {documentText ? (
            <details className="mt-4 rounded-lg border border-border bg-surface p-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                View extracted source text
              </summary>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border pt-3 font-sans text-xs leading-5 text-muted">
                {documentText}
              </pre>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function getReportFindings(findings: ReviewFinding[]) {
  return findings.map((finding) => ({
    field: FIELD_LABELS[finding.field],
    value: finding.editedValue,
    status: getStatusLabel(finding.status),
    sourceExcerpt: finding.sourceExcerpt,
    sourceSection: finding.sourceSection,
  }));
}

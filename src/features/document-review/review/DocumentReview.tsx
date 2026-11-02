"use client";

import { useEffect, useReducer, useState } from "react";
import type { ChangeEvent } from "react";
import {
  includesNormalizedEvidence,
  normalizeEvidenceQuote,
} from "../contracts";
import type { SuggestedCode } from "../contracts";
import { createAuditEvent } from "./audit";
import {
  extractFindings,
  type ExtractionService,
} from "../extraction/extraction-service";
import { reviewReducer } from "./review-state";
import type { ReviewFinding } from "./review-state";
import { FIELD_LABELS, MESSAGES, type Language } from "@/shared/language";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type ReportState = "idle" | "generating" | "downloaded" | "error";
type FhirState = "idle" | "generating" | "downloaded" | "error";
const MAX_UPLOAD_BYTES = 10_000_000;
const FINDING_DETAIL_LABELS = {
  en: {
    dose: "Dose",
    frequency: "Frequency",
    documentedStatus: "Status",
    unit: "Unit",
    flag: "Flag",
  },
  de: {
    dose: "Dosis",
    frequency: "Häufigkeit",
    documentedStatus: "Status",
    unit: "Einheit",
    flag: "Kennzeichen",
  },
} as const;

function getStatusLabel(
  status: "draft" | "accepted" | "rejected",
  language: Language,
) {
  const message = MESSAGES[language];
  if (status === "accepted") return message.accepted;
  if (status === "rejected") return message.rejected;
  return message.draft;
}

export function DocumentReview({
  extractFindings: runExtraction = extractFindings,
  language,
}: {
  extractFindings?: ExtractionService;
  language: Language;
}) {
  const message = MESSAGES[language];
  const [retryKey, setRetryKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [fhirState, setFhirState] = useState<FhirState>("idle");
  const [findings, dispatch] = useReducer(reviewReducer, []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [redactionCounts, setRedactionCounts] = useState<
    Record<string, number> | null
  >(null);
  const [modelName, setModelName] = useState("");
  const [promptVersion, setPromptVersion] = useState("");
  const [auditEvents, setAuditEvents] = useState<
    ReturnType<typeof createAuditEvent>[]
  >([]);
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [authorizedToSend, setAuthorizedToSend] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [fhirError, setFhirError] = useState<string | null>(null);
  const [fhirExcludedCount, setFhirExcludedCount] = useState(0);
  const [fhirUnknownMedicationStatusCount, setFhirUnknownMedicationStatusCount] = useState(0);
  const [findingsSkipped, setFindingsSkipped] = useState(0);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(null);
    setDocumentText("");
    setSubmittedText("");
    setRedactionCounts(null);
    setModelName("");
    setPromptVersion("");
    setAuditEvents([]);
    setAnalysisRequested(false);
    setAuthorizedToSend(false);
    setUploadError(null);
    setReportError(null);
    setFhirError(null);
    setReportState("idle");
    setFhirState("idle");
    setFhirExcludedCount(0);
    setFhirUnknownMedicationStatusCount(0);
    setFindingsSkipped(0);
    setLoadState({ status: "idle" });
    dispatch({ type: "load", findings: [] });
    if (!file) return;

    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      (file.type !== "" && file.type !== "application/pdf")
    ) {
      setUploadError(message.invalidPdf);
      return;
    }

    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      setUploadError(message.invalidSize);
      return;
    }

    setSelectedFile(file);
  }

  function analyzeDocument() {
    if (!selectedFile || !authorizedToSend) return;
    setDocumentText("");
    setSubmittedText("");
    setRedactionCounts(null);
    setModelName("");
    setPromptVersion("");
    setFindingsSkipped(0);
    setAuditEvents([]);
    setAnalysisRequested(true);
    setLoadState({ status: "loading" });
    setUploadError(null);
    setReportError(null);
    setFhirError(null);
    setReportState("idle");
    setFhirState("idle");
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
        setSubmittedText(response.submittedText);
        setRedactionCounts(response.redactionCounts);
        setModelName(response.modelName);
        setPromptVersion(response.promptVersion);
        setFindingsSkipped(response.findingsSkipped);
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
              : MESSAGES.en.extractionError,
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
      const { downloadReviewPdf } = await import("../export/pdf-report");
      await downloadReviewPdf(selectedFile.name, findings);
      setReportState("downloaded");
    } catch {
      setReportState("error");
      setReportError("The PDF could not be generated. Please try again.");
    }
  }

  async function generateAndDownloadFhir() {
    if (loadState.status !== "ready") return;
    setFhirState("generating");
    setFhirError(null);
    setFhirExcludedCount(0);
    setFhirUnknownMedicationStatusCount(0);

    try {
      const { downloadFhirBundle } = await import("../export/fhir-export");
      const result = downloadFhirBundle(findings);
      setFhirExcludedCount(result.excludedCount);
      setFhirUnknownMedicationStatusCount(result.unknownMedicationStatusCount);
      setFhirState("downloaded");
    } catch {
      setFhirState("error");
      setFhirError(message.fhirError);
    }
  }

  function recordAudit(action: "edit" | "accept" | "reject", findingId: string) {
    setAuditEvents((events) => [
      ...events,
      createAuditEvent(
        action,
        findingId,
        modelName || "Unavailable",
        promptVersion || "Unavailable",
      ),
    ]);
  }

  function updateSuggestedCode(
    finding: ReviewFinding,
    system: SuggestedCode["system"],
    code: string,
  ) {
    dispatch({
      type: "edit-code",
      id: finding.id,
      suggestedCode: { system, code },
    });
  }

  const resultsReady = loadState.status === "ready";
  const hasFhirFindings = findings.some(
    (finding) =>
      finding.status === "accepted" &&
      finding.field !== "visit_preparation" &&
      finding.field !== "patient_instruction",
  );

  return (
    <div
      aria-busy={
        loadState.status === "loading" ||
        reportState === "generating" ||
        fhirState === "generating"
      }
      className="space-y-5"
      id="document-review"
    >
      <section
        aria-labelledby="document-review-heading"
        className="rounded-2xl border border-border bg-panel p-4 shadow-[0_2px_8px_rgba(27,61,51,0.035)] sm:p-6"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
          {message.reviewEyebrow}
        </p>
        <h2
          className="mt-1 text-xl font-semibold tracking-tight text-ink"
          id="document-review-heading"
        >
          {message.reviewTitle}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          {message.reviewLead}
        </p>
        <p className="mt-3 rounded-lg border border-warning/20 bg-warning-surface px-3 py-2 text-sm font-medium leading-5 text-warning">
          {message.safetyNotice}
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
            {message.uploadTitle}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {message.uploadLead}
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="sr-only" htmlFor="document-upload">
            {message.choosePdf}
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
                {message.analyzing}
              </>
            ) : (
              message.analyze
            )}
          </button>
        </div>

        <p className="mt-2 text-xs leading-5 text-muted">
          {message.uploadHint}
        </p>
        {selectedFile ? (
          <p className="mt-2 break-all text-xs font-medium text-ink">
            {message.selected}: {selectedFile.name} ·{" "}
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
            {message.authorize}
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
              {message.findings}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {resultsReady
                ? language === "de"
                  ? `${findings.length} ${findings.length === 1 ? "Angabe" : "Angaben"} ${message.extractedCount}`
                  : `${findings.length} ${findings.length === 1 ? "finding" : "findings"} ${message.extractedCount}`
                : message.findingsAfter}
            </p>
          </div>
          <div className="flex max-w-full flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
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
                    {message.generatingPdf}
                  </>
                ) : reportState === "downloaded" ? (
                  message.downloadAgain
                ) : (
                  message.generatePdf
                )}
              </button>
              <button
                className="flex items-center justify-center rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !resultsReady ||
                  !hasFhirFindings ||
                  fhirState === "generating"
                }
                onClick={() => void generateAndDownloadFhir()}
                type="button"
              >
                {fhirState === "generating" ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    />
                    {message.downloadingFhir}
                  </>
                ) : (
                  message.generateFhir
                )}
              </button>
            </div>
            {reportState === "downloaded" ? (
              <p className="text-xs font-medium text-positive" role="status">
                {message.pdfDownloaded}
              </p>
            ) : null}
            {reportError ? (
              <p className="text-xs font-medium text-negative" role="alert">
                {language === "de" ? message.reportError : reportError}
              </p>
            ) : null}
            {fhirState === "downloaded" ? (
              <p className="text-right text-xs font-medium text-positive" role="status">
                {message.fhirDownloaded}
                {fhirExcludedCount > 0
                  ? ` ${fhirExcludedCount} ${message.fhirExcluded}`
                  : ""}
              </p>
            ) : null}
            {fhirState === "downloaded" &&
            fhirUnknownMedicationStatusCount > 0 ? (
              <p className="text-right text-xs font-medium text-warning" role="alert">
                {fhirUnknownMedicationStatusCount}{" "}
                {message.fhirUnknownMedicationStatus}
              </p>
            ) : null}
            {fhirError ? (
              <p className="text-xs font-medium text-negative" role="alert">
                {fhirError}
              </p>
            ) : null}
            <p className="max-w-2xl text-right text-xs leading-5 text-muted">
              {message.exportNote}
            </p>
          </div>
        </div>

        <div>
          {loadState.status === "idle" ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm leading-5 text-muted">
              {message.idleResults}
            </p>
          ) : null}
          {loadState.status === "loading" ? (
            <p
              aria-live="polite"
              className="rounded-lg bg-surface px-3 py-5 text-center text-sm text-muted"
            >
              {message.waiting}
            </p>
          ) : null}
          {loadState.status === "error" ? (
            <div
              className="rounded-lg border border-negative/25 bg-negative-surface p-3"
              role="alert"
            >
              <p className="text-sm font-semibold text-negative">
                {message.analysisFailed}
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
                {message.retry}
              </button>
            </div>
          ) : null}
          {resultsReady && findings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm leading-5 text-muted">
              {message.noFindings}
            </p>
          ) : null}
          {resultsReady && findingsSkipped > 0 ? (
            <p
              className="mb-3 rounded-lg border border-warning/25 bg-warning-surface px-3 py-2 text-sm text-warning"
              role="status"
            >
              {findingsSkipped} {message.skippedFindings}
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
                      {FIELD_LABELS[language][finding.field]}
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
                      {getStatusLabel(finding.status, language)}
                    </span>
                  </div>
                  {finding.field === "observation" && finding.name ? (
                    <p className="mt-3 text-sm font-semibold text-ink">
                      {finding.name}
                    </p>
                  ) : null}
                  {finding.status === "draft" ? (
                    <div className="mt-3">
                      <label
                        className="block text-xs font-semibold text-ink"
                        htmlFor={`finding-${finding.id}`}
                      >
                        {message.editDraft}
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
                        onBlur={() => recordAudit("edit", finding.id)}
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
                          ? message.clinicianValue
                          : message.rejectedDraft}
                      </p>
                      {finding.field === "observation" && finding.name ? (
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {finding.name}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm leading-5 text-ink">
                        {finding.editedValue}
                      </p>
                    </div>
                  )}
                  {(
                    [
                      "dose",
                      "frequency",
                      "documentedStatus",
                      "unit",
                      "flag",
                    ] as const
                  ).some((key) => finding[key]) ? (
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      {(
                        [
                          "dose",
                          "frequency",
                          "documentedStatus",
                          "unit",
                          "flag",
                        ] as const
                      ).flatMap((key) =>
                        finding[key]
                          ? [
                              <div key={key}>
                                <dt className="font-semibold text-muted">
                                  {FINDING_DETAIL_LABELS[language][key]}
                                </dt>
                                <dd className="mt-0.5 text-ink">
                                  {finding[key]}
                                </dd>
                              </div>,
                            ]
                          : [],
                      )}
                    </dl>
                  ) : null}
                  {finding.status === "draft" && finding.suggestedCode ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(8rem,0.35fr)_minmax(12rem,1fr)]">
                      <label className="text-xs font-semibold text-ink">
                        {message.suggestedCode}
                        <span className="mt-1 block font-normal text-muted">
                          {message.codeSystem}
                        </span>
                        <select
                          className="mt-1.5 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal text-ink"
                          onBlur={() => recordAudit("edit", finding.id)}
                          onChange={(event) => {
                            const system = event.currentTarget.value;
                            if (
                              system === "ICD-10-GM" ||
                              system === "ATC" ||
                              system === "LOINC"
                            ) {
                              updateSuggestedCode(
                                finding,
                                system,
                                finding.suggestedCode?.code ?? "",
                              );
                            }
                          }}
                          value={finding.suggestedCode.system}
                        >
                          <option value="ICD-10-GM">ICD-10-GM</option>
                          <option value="ATC">ATC</option>
                          <option value="LOINC">LOINC</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-ink">
                        {message.suggestedCode}
                        <span className="mt-1 block font-normal text-muted">
                          {message.codeValue}
                        </span>
                        <input
                          className="mt-1.5 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal text-ink"
                          onBlur={() => recordAudit("edit", finding.id)}
                          onChange={(event) =>
                            updateSuggestedCode(
                              finding,
                              finding.suggestedCode?.system ?? "LOINC",
                              event.currentTarget.value,
                            )
                          }
                          value={finding.suggestedCode.code}
                        />
                      </label>
                    </div>
                  ) : finding.status === "draft" ? (
                    <p className="mt-3 text-xs text-muted">{message.noCode}</p>
                  ) : null}
                  {(
                    finding.evidence ?? [
                      {
                        quote: finding.sourceExcerpt,
                        section: finding.sourceSection,
                      },
                    ]
                  ).map((evidence, index) => (
                      <div
                        className="mt-3 rounded-lg border-l-2 border-primary/40 bg-surface px-3 py-2"
                        key={`${finding.id}-evidence-${index}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                            {message.sourceEvidence}
                            {evidence.section
                              ? ` · ${evidence.section}`
                              : ""}
                          </p>
                          <span
                            className={
                              includesNormalizedEvidence(
                                documentText,
                                normalizeEvidenceQuote(evidence.quote),
                              )
                                ? "text-[10px] font-semibold text-positive"
                                : "text-[10px] font-semibold text-negative"
                            }
                          >
                            {includesNormalizedEvidence(
                              documentText,
                              normalizeEvidenceQuote(evidence.quote),
                            )
                              ? message.verified
                              : message.unverified}
                          </span>
                        </div>
                        <blockquote className="mt-1 text-sm leading-5 text-ink">
                          “{normalizeEvidenceQuote(evidence.quote)}”
                        </blockquote>
                      </div>
                  ))}
                  {finding.status === "draft" ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={finding.editedValue.trim().length === 0}
                        onClick={() =>
                          {
                            dispatch({ type: "accept", id: finding.id });
                            recordAudit("accept", finding.id);
                          }
                        }
                        type="button"
                      >
                        {message.accept}
                      </button>
                      <button
                        className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
                        onClick={() =>
                          {
                            dispatch({ type: "reject", id: finding.id });
                            recordAudit("reject", finding.id);
                          }
                        }
                        type="button"
                      >
                        {message.reject}
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
                {message.sourceText}
              </summary>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border pt-3 font-sans text-xs leading-5 text-muted">
                {documentText}
              </pre>
            </details>
          ) : null}
          {submittedText ? (
            <details className="mt-3 rounded-lg border border-border bg-surface p-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                {message.whatWasSent}
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted">
                {message.redactionSummary}:{" "}
                {redactionCounts
                  ? Object.entries(redactionCounts)
                      .filter(([, count]) => count > 0)
                      .map(([type, count]) => `${type}: ${count}`)
                      .join(", ") || "none"
                  : "none"}
                {modelName ? ` · ${modelName} · ${promptVersion}` : ""}
              </p>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border pt-3 font-sans text-xs leading-5 text-muted">
                {submittedText}
              </pre>
            </details>
          ) : null}
          {resultsReady ? (
            <details className="mt-3 rounded-lg border border-border bg-white p-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                {message.auditTitle}
              </summary>
              {auditEvents.length === 0 ? (
                <p className="mt-3 text-xs text-muted">{message.auditEmpty}</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {[...auditEvents].reverse().map((entry, index) => (
                    <li
                      className="rounded-lg bg-surface p-3 text-xs leading-5"
                      key={`${entry.timestamp}-${entry.findingId}-${index}`}
                    >
                      <p>
                        <strong>{message.auditAction}:</strong>{" "}
                        {entry.action === "edit"
                          ? message.actionEdit
                          : entry.action === "accept"
                            ? message.accept
                            : message.reject}{" "}
                        ·{" "}
                        <strong>{message.auditFinding}:</strong> {entry.findingId}
                      </p>
                      <p>
                        <strong>{message.auditTime}:</strong> {entry.timestamp}
                      </p>
                      <p>
                        <strong>{message.auditModel}:</strong> {entry.modelName} ·{" "}
                        <strong>{message.auditPrompt}:</strong> {entry.promptVersion}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-xs text-muted">
                Prototype audit events are held in memory only and contain no
                document or finding text.
              </p>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function getReportFindings(
  findings: ReviewFinding[],
  language: Language = "en",
) {
  return findings.map((finding) => ({
    field: FIELD_LABELS[language][finding.field],
    value: finding.editedValue,
    status: getStatusLabel(finding.status, language),
    sourceExcerpt: normalizeEvidenceQuote(finding.sourceExcerpt),
    sourceSection: finding.sourceSection,
    suggestedCode: finding.suggestedCode,
  }));
}

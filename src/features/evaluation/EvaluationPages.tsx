import Link from "next/link";
import {
  EVALUATION_DOCUMENTS,
  evaluateCandidates,
  MIN_EVIDENCE_VERIFICATION_PASS_RATE,
} from "@/evaluation/benchmark";
import { FIELD_LABELS } from "@/shared/language";
import { normalizeEvidenceQuote } from "@/features/document-review/contracts";

const metrics = evaluateCandidates();
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function EvaluationCorpusPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:px-8">
      <Link className="text-sm font-semibold text-primary hover:underline" href="/">
        ← Review workbench
      </Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-primary">
        Offline evaluation set
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
        Synthetic labeled documents
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Eight fully synthetic, labeled documents exercise English and German
        extraction and evidence checks. This corpus is isolated from the upload
        flow and is never sent to Gemini by this page.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {EVALUATION_DOCUMENTS.map((document) => (
          <article
            className="rounded-2xl border border-border bg-white p-5"
            key={document.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">{document.title}</h2>
                <p className="mt-1 text-xs text-muted">
                  {document.id} · {document.language === "de" ? "Deutsch" : "English"}
                </p>
              </div>
              <span className="rounded-full border border-warning/20 bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning">
                Synthetic
              </span>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-surface p-3 font-sans text-sm leading-6 text-ink">
              {document.sourceText}
            </pre>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">
              Gold labels
            </h3>
            <ul className="mt-2 space-y-2">
              {document.expected.map((finding, index) => (
                <li
                  className="rounded-lg border border-border p-3 text-sm"
                  key={`${document.id}-gold-${index}`}
                >
                  <p className="font-semibold text-primary">
                    {FIELD_LABELS[document.language][finding.field]}: {finding.value}
                  </p>
                  <p className="mt-1 text-muted">Evidence: “{normalizeEvidenceQuote(finding.sourceExcerpt)}”</p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}

export function EvaluationResultsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:px-8">
      <Link className="text-sm font-semibold text-primary hover:underline" href="/">
        ← Review workbench
      </Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-primary">
        Evaluation harness
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
        Offline benchmark results
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        These deterministic metrics score curated candidate outputs against
        eight synthetic English and German gold documents. They verify the
        scoring pipeline and are not measurements of Gemini model quality.
      </p>

      <section
        aria-label="Evaluation metrics"
        className="mt-6 grid gap-4 sm:grid-cols-3"
      >
        {[
          ["Precision", percent(metrics.precision)],
          ["Recall", percent(metrics.recall)],
          ["Evidence verification", percent(metrics.evidenceVerificationPassRate)],
        ].map(([label, value]) => (
          <div
            className="rounded-2xl border border-border bg-white p-5"
            key={label}
          >
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold text-ink">Scoring details</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">True positives</dt>
            <dd className="font-semibold text-ink">{metrics.truePositives}</dd>
          </div>
          <div>
            <dt className="text-muted">False positives</dt>
            <dd className="font-semibold text-ink">{metrics.falsePositives}</dd>
          </div>
          <div>
            <dt className="text-muted">False negatives</dt>
            <dd className="font-semibold text-ink">{metrics.falseNegatives}</dd>
          </div>
          <div>
            <dt className="text-muted">Evidence-pass CI threshold</dt>
            <dd className="font-semibold text-ink">
              {percent(MIN_EVIDENCE_VERIFICATION_PASS_RATE)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 rounded-lg bg-warning-surface p-3 text-sm leading-6 text-warning">
          A verified quote only shows that the excerpt occurs in the source;
          it does not prove that the finding is clinically correct or
          appropriately interpreted.
        </p>
        <Link
          className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
          href="/eval"
        >
          View the labeled synthetic documents
        </Link>
      </section>
    </main>
  );
}

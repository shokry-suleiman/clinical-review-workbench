import type { ConfirmedFinding } from "@/features/document-review/review-state";

const FIELD_LABELS = {
  follow_up: "Follow-up",
  visit_preparation: "Visit preparation",
} as const;

export function PatientContext({
  confirmedFindings,
}: {
  confirmedFindings: ConfirmedFinding[];
}) {
  return (
    <section
      aria-labelledby="patient-context-heading"
      className="rounded-2xl border border-border bg-panel p-5 shadow-[0_2px_8px_rgba(27,61,51,0.035)]"
      id="patient-context"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Patient context
          </p>
          <h2
            className="mt-1 text-lg font-semibold tracking-tight text-ink"
            id="patient-context-heading"
          >
            Morgan Reyes
          </h2>
        </div>
        <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-semibold tracking-wide text-muted">
          FICTIONAL
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Demo ID
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink">DEMO-1042</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Age
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink">42 · fictional</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Clinician-reviewed information
          </h3>
          <span className="text-xs tabular-nums text-muted">
            {confirmedFindings.length}
          </span>
        </div>

        {confirmedFindings.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm leading-5 text-muted">
            Nothing confirmed yet. Draft findings stay out of patient context
            until reviewed.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {confirmedFindings.map((finding) => (
              <li
                className="rounded-lg border border-positive/20 bg-positive-surface p-3"
                key={finding.id}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-positive">
                  Reviewed · {FIELD_LABELS[finding.field]}
                </p>
                <p className="mt-1 text-sm font-medium leading-5 text-ink">
                  {finding.value}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-5 rounded-lg border border-border bg-white px-3 py-2.5 text-xs leading-5 text-muted">
        This sample is entirely fictional. It is not a real patient record.
      </p>
    </section>
  );
}

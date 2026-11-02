import {
  includesNormalizedEvidence,
  normalizeEvidence,
} from "../features/document-review/contracts";
import type { ExtractionField } from "@/features/document-review/contracts";

export type EvaluationFinding = {
  field: ExtractionField;
  value: string;
  sourceExcerpt: string;
};

export type EvaluationDocument = {
  id: string;
  language: "en" | "de";
  title: string;
  sourceText: string;
  expected: EvaluationFinding[];
  candidate: EvaluationFinding[];
};

export const EVALUATION_DOCUMENTS: EvaluationDocument[] = [
  {
    id: "en-01",
    language: "en",
    title: "Follow-up instruction",
    sourceText: "Plan: Return in 6 weeks for a follow-up visit.",
    expected: [
      {
        field: "follow_up",
        value: "Return in 6 weeks for a follow-up visit.",
        sourceExcerpt: "Return in 6 weeks for a follow-up visit.",
      },
    ],
    candidate: [
      {
        field: "follow_up",
        value: "Return in 6 weeks for a follow-up visit.",
        sourceExcerpt: "Return in 6 weeks for a follow-up visit.",
      },
      {
        field: "service_request",
        value: "MRI was ordered.",
        sourceExcerpt: "Return in 6 weeks for a follow-up visit.",
      },
    ],
  },
  {
    id: "en-02",
    language: "en",
    title: "Visit preparation",
    sourceText: "Please bring the home blood pressure log to the appointment.",
    expected: [
      {
        field: "visit_preparation",
        value: "Bring the home blood pressure log.",
        sourceExcerpt: "bring the home blood pressure log",
      },
    ],
    candidate: [
      {
        field: "visit_preparation",
        value: "Bring the home blood pressure log.",
        sourceExcerpt: "bring the home blood pressure log",
      },
    ],
  },
  {
    id: "en-03",
    language: "en",
    title: "Recorded observation",
    sourceText: "Observation: Home readings were recorded daily.",
    expected: [
      {
        field: "observation",
        value: "Home readings were recorded daily.",
        sourceExcerpt: "Home readings were recorded daily.",
      },
    ],
    candidate: [
      {
        field: "observation",
        value: "Home readings were recorded daily.",
        sourceExcerpt: "Home readings were recorded daily.",
      },
    ],
  },
  {
    id: "en-04",
    language: "en",
    title: "Documented medication",
    sourceText: "Current medication list: Metformin 500 mg.",
    expected: [
      {
        field: "medication_statement",
        value: "Metformin 500 mg.",
        sourceExcerpt: "Metformin 500 mg.",
      },
    ],
    candidate: [
      {
        field: "medication_statement",
        value: "Metformin 500 mg.",
        sourceExcerpt: "Metformin 500 mg.",
      },
    ],
  },
  {
    id: "de-01",
    language: "de",
    title: "Arztbrief · Wiedervorstellung",
    sourceText: "Plan: Wiedervorstellung in sechs Wochen.",
    expected: [
      {
        field: "follow_up",
        value: "Wiedervorstellung in sechs Wochen.",
        sourceExcerpt: "Wiedervorstellung in sechs Wochen.",
      },
    ],
    candidate: [
      {
        field: "follow_up",
        value: "Wiedervorstellung in sechs Wochen.",
        sourceExcerpt: "Wiedervorstellung in sechs Wochen.",
      },
    ],
  },
  {
    id: "de-02",
    language: "de",
    title: "Arztbrief · Vorbereitung",
    sourceText: "Bitte bringen Sie das Blutdruckprotokoll zum Termin mit.",
    expected: [
      {
        field: "visit_preparation",
        value: "Blutdruckprotokoll zum Termin mitbringen.",
        sourceExcerpt: "bringen Sie das Blutdruckprotokoll zum Termin mit",
      },
    ],
    candidate: [
      {
        field: "visit_preparation",
        value: "Blutdruckprotokoll zum Termin mitbringen.",
        sourceExcerpt: "bringen Sie das Blutdruckprotokoll zum Termin mit",
      },
    ],
  },
  {
    id: "de-03",
    language: "de",
    title: "Arztbrief · dokumentierte Beobachtung",
    sourceText: "Befund: Blutdruckmessungen wurden täglich dokumentiert.",
    expected: [
      {
        field: "observation",
        value: "Blutdruckmessungen wurden täglich dokumentiert.",
        sourceExcerpt: "Blutdruckmessungen wurden täglich dokumentiert.",
      },
    ],
    candidate: [
      {
        field: "observation",
        value: "Blutdruckmessungen wurden täglich dokumentiert.",
        sourceExcerpt: "Blutdruckmessungen wurden täglich dokumentiert.",
      },
    ],
  },
  {
    id: "de-04",
    language: "de",
    title: "Arztbrief · synthetische Identifikatoren",
    sourceText:
      "Patientenname: Anna Beispiel\nGeburtsdatum: 03.04.1981\nMRN: DE-TEST-1004\nAdresse: Musterstraße 4, 10115 Berlin\nAktuelle Medikation: Metformin 500 mg.",
    expected: [
      {
        field: "medication_statement",
        value: "Metformin 500 mg.",
        sourceExcerpt: "Metformin 500 mg.",
      },
    ],
    candidate: [
      {
        field: "medication_statement",
        value: "Metformin 500 mg.",
        sourceExcerpt: "Metformin 500 mg.",
      },
    ],
  },
];

export type EvaluationMetrics = {
  precision: number;
  recall: number;
  evidenceVerificationPassRate: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  verifiedEvidence: number;
  predictedFindings: number;
};

export const MIN_EVIDENCE_VERIFICATION_PASS_RATE = 0.95;

function findingKey(finding: EvaluationFinding) {
  return `${finding.field}|${normalizeEvidence(finding.value).toLocaleLowerCase()}`;
}

export function evaluateCandidates(
  documents: EvaluationDocument[] = EVALUATION_DOCUMENTS,
): EvaluationMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let verifiedEvidence = 0;
  let predictedFindings = 0;
  let expectedFindings = 0;

  for (const document of documents) {
    const expected = new Set(document.expected.map(findingKey));
    const matched = new Set<string>();
    expectedFindings += document.expected.length;

    for (const candidate of document.candidate) {
      predictedFindings += 1;
      const verified = includesNormalizedEvidence(
        document.sourceText,
        candidate.sourceExcerpt,
      );
      if (verified) verifiedEvidence += 1;
      const key = findingKey(candidate);
      if (verified && expected.has(key) && !matched.has(key)) {
        truePositives += 1;
        matched.add(key);
      } else {
        falsePositives += 1;
      }
    }

    falseNegatives += document.expected.length - matched.size;
  }

  return {
    precision:
      predictedFindings === 0 ? 0 : truePositives / predictedFindings,
    recall:
      expectedFindings === 0 ? 0 : truePositives / expectedFindings,
    evidenceVerificationPassRate:
      predictedFindings === 0 ? 0 : verifiedEvidence / predictedFindings,
    truePositives,
    falsePositives,
    falseNegatives,
    verifiedEvidence,
    predictedFindings,
  };
}

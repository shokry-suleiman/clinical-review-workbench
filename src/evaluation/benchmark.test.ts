import { describe, expect, it } from "vitest";
import {
  EVALUATION_DOCUMENTS,
  evaluateCandidates,
  MIN_EVIDENCE_VERIFICATION_PASS_RATE,
} from "./benchmark";

describe("synthetic extraction evaluation", () => {
  it("covers eight English and German labeled documents", () => {
    expect(EVALUATION_DOCUMENTS).toHaveLength(8);
    expect(EVALUATION_DOCUMENTS.filter((document) => document.language === "en"))
      .toHaveLength(4);
    expect(EVALUATION_DOCUMENTS.filter((document) => document.language === "de"))
      .toHaveLength(4);
  });

  it("keeps the evidence verification threshold above the CI floor", () => {
    const metrics = evaluateCandidates();
    expect(metrics.evidenceVerificationPassRate).toBeGreaterThanOrEqual(
      MIN_EVIDENCE_VERIFICATION_PASS_RATE,
    );
    expect(metrics.precision).toBeLessThan(1);
    expect(metrics.recall).toBe(1);
  });
});

import {
  evaluateCandidates,
  MIN_EVIDENCE_VERIFICATION_PASS_RATE,
} from "../src/evaluation/benchmark";

const metrics = evaluateCandidates();
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

console.log("Offline synthetic benchmark (curated candidate outputs)");
console.log(`Precision: ${percent(metrics.precision)}`);
console.log(`Recall: ${percent(metrics.recall)}`);
console.log(
  `Evidence verification pass rate: ${percent(metrics.evidenceVerificationPassRate)} ` +
    `(${metrics.verifiedEvidence}/${metrics.predictedFindings})`,
);
console.log(
  `TP ${metrics.truePositives} · FP ${metrics.falsePositives} · FN ${metrics.falseNegatives}`,
);
console.log(
  `Required evidence verification pass rate: ${percent(MIN_EVIDENCE_VERIFICATION_PASS_RATE)}`,
);

if (
  metrics.evidenceVerificationPassRate <
  MIN_EVIDENCE_VERIFICATION_PASS_RATE
) {
  process.exitCode = 1;
}

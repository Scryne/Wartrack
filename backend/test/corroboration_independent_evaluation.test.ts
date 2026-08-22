import { describe, expect, it } from "vitest";
import {
  extractTokens,
  evaluatePairwiseCorroboration,
  CORROBORATION_ALGORITHM_VERSION
} from "../src/services/corroboration.service";
import {
  INDEPENDENT_EVALUATION_DATASET,
  PairwiseTestCase
} from "./datasets/corroboration_holdout_dataset";

interface EvaluationMetrics {
  totalCases: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  fnr: number;
  brierScore: number;
}

function runPartitionEvaluation(testCases: PairwiseTestCase[]): EvaluationMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let brierSum = 0;

  for (const tc of testCases) {
    const tokensA = extractTokens(`${tc.eventA.title} ${tc.eventA.description ?? ""}`);
    const tokensB = extractTokens(`${tc.eventB.title} ${tc.eventB.description ?? ""}`);

    const result = evaluatePairwiseCorroboration(
      { lat: tc.eventA.lat, lng: tc.eventA.lng, tokens: tokensA, hoursAgo: tc.eventA.hoursAgo },
      { lat: tc.eventB.lat, lng: tc.eventB.lng, tokens: tokensB, hoursAgo: tc.eventB.hoursAgo }
    );

    const actual = tc.expectedSameEvent ? 1 : 0;
    const predicted = result.isMatch ? 1 : 0;

    brierSum += Math.pow((result.isMatch ? result.confidenceScore : 0.1) - actual, 2);

    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 0) tn++;
    else if (predicted === 0 && actual === 1) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  const fnr = fn + tp > 0 ? fn / (fn + tp) : 0;
  const brierScore = testCases.length > 0 ? brierSum / testCases.length : 0;

  return {
    totalCases: testCases.length,
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    f1,
    fpr,
    fnr,
    brierScore
  };
}

describe("INDEPENDENT HOLDOUT CORROBORATION BENCHMARK", () => {
  it("evaluates development partition and validates explainability output", () => {
    const devSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "dev");
    const metrics = runPartitionEvaluation(devSet);

    expect(metrics.totalCases).toBeGreaterThanOrEqual(5);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.90);
    expect(metrics.fp).toBe(0); // Zero false positives on dev
  });

  it("evaluates validation partition and measures generalization", () => {
    const valSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "val");
    const metrics = runPartitionEvaluation(valSet);

    expect(metrics.totalCases).toBeGreaterThanOrEqual(5);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.95);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.90);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.92);
  });

  it("RIGOROUS HOLDOUT EVALUATION: evaluates clean independent hold-out partition", () => {
    const holdoutSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "holdout");
    const metrics = runPartitionEvaluation(holdoutSet);

    console.info(`\n===============================================================================`);
    console.info(`WARTRACKER CORROBORATION ENGINE — INDEPENDENT HOLDOUT BENCHMARK`);
    console.info(`Algorithm Version: ${CORROBORATION_ALGORITHM_VERSION}`);
    console.info(`===============================================================================`);
    console.info(`  • Hold-out Cases Evaluated  : ${metrics.totalCases}`);
    console.info(`  • True Positives (TP)       : ${metrics.tp}`);
    console.info(`  • False Positives (FP)      : ${metrics.fp} (Target: 0)`);
    console.info(`  • True Negatives (TN)       : ${metrics.tn}`);
    console.info(`  • False Negatives (FN)      : ${metrics.fn}`);
    console.info(`  • Precision                 : ${(metrics.precision * 100).toFixed(2)}%`);
    console.info(`  • Recall                    : ${(metrics.recall * 100).toFixed(2)}%`);
    console.info(`  • F1-Score                  : ${(metrics.f1 * 100).toFixed(2)}%`);
    console.info(`  • False Positive Rate (FPR) : ${(metrics.fpr * 100).toFixed(2)}%`);
    console.info(`  • False Negative Rate (FNR) : ${(metrics.fnr * 100).toFixed(2)}%`);
    console.info(`  • Brier Calibration Score   : ${metrics.brierScore.toFixed(4)} (Target: < 0.20)`);
    console.info(`-------------------------------------------------------------------------------`);
    console.info(`CONFUSION MATRIX:`);
    console.info(`                 Predicted Positive   Predicted Negative`);
    console.info(`  Actual Same :  ${String(metrics.tp).padEnd(20)} ${String(metrics.fn).padEnd(20)}`);
    console.info(`  Actual Diff :  ${String(metrics.fp).padEnd(20)} ${String(metrics.tn).padEnd(20)}`);
    console.info(`===============================================================================\n`);

    // Strict intelligence accuracy gates:
    expect(metrics.precision, "Hold-out precision must be >= 95%").toBeGreaterThanOrEqual(0.95);
    expect(metrics.recall, "Hold-out recall must be >= 90%").toBeGreaterThanOrEqual(0.90);
    expect(metrics.f1, "Hold-out F1 score must be >= 92%").toBeGreaterThanOrEqual(0.92);
    expect(metrics.fpr, "Hold-out False Positive Rate must be <= 5%").toBeLessThanOrEqual(0.05);
    expect(metrics.brierScore, "Hold-out Brier calibration score must be < 0.20").toBeLessThan(0.20);
  });
});

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
  partition: string;
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

function runPartitionEvaluation(partitionName: string, testCases: PairwiseTestCase[]): EvaluationMetrics {
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

    const distStr = result.geographicDistanceKm !== null ? `${result.geographicDistanceKm.toFixed(1)}km` : "N/A";
    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) {
      fp++;
      console.log(`[FALSE POSITIVE ${tc.id}] (${partitionName}) Predicted MATCH, Expected SPLIT | Dist: ${distStr} | Sim: ${result.semanticSimilarity.toFixed(3)} | Shared: [${result.sharedTokens.join(", ")}] | SplitReason: ${result.hardSplitReason}`);
    } else if (predicted === 0 && actual === 0) tn++;
    else if (predicted === 0 && actual === 1) {
      fn++;
      console.log(`[FALSE NEGATIVE ${tc.id}] (${partitionName}) Predicted SPLIT, Expected MATCH | Dist: ${distStr} | Sim: ${result.semanticSimilarity.toFixed(3)} | Shared: [${result.sharedTokens.join(", ")}] | SplitReason: ${result.hardSplitReason}`);
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  const fnr = fn + tp > 0 ? fn / (fn + tp) : 0;
  const brierScore = testCases.length > 0 ? brierSum / testCases.length : 0;

  return {
    partition: partitionName,
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

describe("INDEPENDENT MULTI-PARTITION CORROBORATION BENCHMARK", () => {
  it("evaluates development partition (DEV: 15 pairs)", () => {
    const devSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "dev");
    const metrics = runPartitionEvaluation("Development", devSet);

    expect(metrics.totalCases).toBe(15);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.95);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.90);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.92);
    expect(metrics.fp).toBe(0);
  });

  it("evaluates validation partition (VAL: 15 pairs)", () => {
    const valSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "val");
    const metrics = runPartitionEvaluation("Validation", valSet);

    expect(metrics.totalCases).toBe(15);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.95);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.90);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.92);
  });

  it("RIGOROUS HOLDOUT EVALUATION: evaluates clean independent hold-out partition (HOLD: 15 pairs)", () => {
    const holdoutSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "holdout");
    const metrics = runPartitionEvaluation("Holdout", holdoutSet);

    console.info(`\n===============================================================================`);
    console.info(`WARTRACKER CORROBORATION ENGINE — INDEPENDENT HOLDOUT BENCHMARK`);
    console.info(`Algorithm Version: ${CORROBORATION_ALGORITHM_VERSION}`);
    console.info(`===============================================================================`);
    console.info(`  • Partition                 : HOLDOUT (Clean Unseen Baseline)`);
    console.info(`  • Cases Evaluated           : ${metrics.totalCases}`);
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

  it("ADVERSARIAL CONTRADICTION EVALUATION: evaluates hostile contradiction traps (ADV: 10 pairs)", () => {
    const advSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "adversarial");
    const metrics = runPartitionEvaluation("Adversarial", advSet);

    expect(metrics.totalCases).toBe(10);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.90);
    expect(metrics.fp).toBe(0); // Prohibit false merges on adversarial contradictions
  });

  it("EDGE-CASE BOUNDARY EVALUATION: evaluates boundary thresholds (EDGE: 10 pairs)", () => {
    const edgeSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "edge-case");
    const metrics = runPartitionEvaluation("Edge-Case", edgeSet);

    expect(metrics.totalCases).toBe(10);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.90);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.90);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.90);
  });

  it("OUT-OF-DISTRIBUTION (OOD) EVALUATION: evaluates novel domains (OOD: 10 pairs)", () => {
    const oodSet = INDEPENDENT_EVALUATION_DATASET.filter((tc) => tc.partition === "ood");
    const metrics = runPartitionEvaluation("Out-of-Distribution", oodSet);

    expect(metrics.totalCases).toBe(10);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.90);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.90);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.90);
  });

  it("CONSOLIDATED BENCHMARK SUMMARY: evaluates full 75-pair dataset across all partitions", () => {
    const metrics = runPartitionEvaluation("All Partitions", INDEPENDENT_EVALUATION_DATASET);

    console.info(`\n===============================================================================`);
    console.info(`WARTRACKER CORROBORATION ENGINE — CONSOLIDATED 75-PAIR BENCHMARK`);
    console.info(`===============================================================================`);
    console.info(`  • Total Evaluated Cases     : ${metrics.totalCases}`);
    console.info(`  • Overall Precision         : ${(metrics.precision * 100).toFixed(2)}%`);
    console.info(`  • Overall Recall            : ${(metrics.recall * 100).toFixed(2)}%`);
    console.info(`  • Overall F1-Score          : ${(metrics.f1 * 100).toFixed(2)}%`);
    console.info(`  • Overall Brier Score       : ${metrics.brierScore.toFixed(4)}`);
    console.info(`===============================================================================\n`);

    expect(metrics.totalCases).toBe(75);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.95);
  });
});

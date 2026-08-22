import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { computeExplainableThreat } from "../src/services/threat.service";

const app = createApp(["http://localhost:5173"]);

describe("Explainable Threat Service", () => {
  it("computes threat analysis with auditable drivers and metrics", () => {
    const analysis = computeExplainableThreat();

    expect(analysis).toHaveProperty("threatLevel");
    expect([1, 2, 3, 4, 5]).toContain(analysis.threatLevel);
    expect(analysis).toHaveProperty("threatLabel");
    expect(analysis).toHaveProperty("confidence");
    expect(analysis).toHaveProperty("drivers");
    expect(Array.isArray(analysis.drivers)).toBe(true);
    expect(analysis.drivers.length).toBeGreaterThan(0);
    expect(analysis).toHaveProperty("temporalTrend");
    expect(["ESCALATING", "STABLE", "DE-ESCALATING"]).toContain(analysis.temporalTrend);
    expect(analysis.metrics).toHaveProperty("criticalEventsLast1h");
  });

  it("exposes GET /api/events/threat-analysis successfully", async () => {
    const res = await request(app).get("/api/events/threat-analysis");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("threatLevel");
    expect(res.body).toHaveProperty("drivers");
    expect(res.body).toHaveProperty("metrics");
  });
});

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const app = createApp(["http://localhost:5173"]);

describe("GET /api/events/sitrep", () => {
  it("returns a markdown situation report by default", async () => {
    const res = await request(app).get("/api/events/sitrep");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toContain("WARTRACKER STRATEJİK & OPERASYONEL DURUM RAPORU (SITREP V2)");
    expect(res.text).toContain("YÖNETİCİ ÖZETİ & TEHDİT SÜRÜCÜLERİ");
    expect(res.text).toContain("DÖNEMSEL DEĞİŞİM & İSTİHBARAT DELTASI");
  });

  it("returns a structured JSON situation report with delta and clusters when format=json is requested", async () => {
    const res = await request(app).get("/api/events/sitrep?format=json");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("generatedAt");
    expect(res.body).toHaveProperty("threatAnalysis");
    expect(res.body).toHaveProperty("threatLevel");
    expect(res.body).toHaveProperty("threatLabel");
    expect(res.body).toHaveProperty("clusters");
    expect(res.body).toHaveProperty("eventsCount");
    expect(res.body).toHaveProperty("priorEventsCount");
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("pins");
    expect(Array.isArray(res.body.clusters)).toBe(true);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(Array.isArray(res.body.pins)).toBe(true);
  });

  it("respects hours parameter within allowed range", async () => {
    const res = await request(app).get("/api/events/sitrep?hours=12&format=json");

    expect(res.status).toBe(200);
    expect(res.body.hours).toBe(12);
  });

  it("rejects invalid hours with a 400 bad request", async () => {
    const res = await request(app).get("/api/events/sitrep?hours=invalid");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hours/i);
  });
});

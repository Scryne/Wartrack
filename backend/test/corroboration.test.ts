import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { clusterRecentEvents } from "../src/services/corroboration.service";

const app = createApp(["http://localhost:5173"]);

describe("Event Corroboration & Clustering", () => {
  it("clusters events and generates confidence ratings without crashing", () => {
    const clusters = clusterRecentEvents(48);

    expect(Array.isArray(clusters)).toBe(true);
    for (const cluster of clusters) {
      expect(cluster).toHaveProperty("clusterId");
      expect(cluster).toHaveProperty("primaryEvent");
      expect(cluster).toHaveProperty("confidence");
      expect(["HIGH", "MEDIUM", "LOW", "UNVERIFIED"]).toContain(cluster.confidence);
      expect(cluster).toHaveProperty("independentSourceCount");
      expect(Array.isArray(cluster.sources)).toBe(true);
    }
  });

  it("exposes GET /api/events/clusters over HTTP", async () => {
    const res = await request(app).get("/api/events/clusters?hours=24");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("hours", 24);
    expect(res.body).toHaveProperty("totalClusters");
    expect(res.body).toHaveProperty("clusters");
    expect(Array.isArray(res.body.clusters)).toBe(true);
  });

  it("exposes GET /api/events/timeline with hourly buckets", async () => {
    const res = await request(app).get("/api/events/timeline?hours=24");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("hours", 24);
    expect(res.body).toHaveProperty("timeline");
    expect(Array.isArray(res.body.timeline)).toBe(true);
  });
});

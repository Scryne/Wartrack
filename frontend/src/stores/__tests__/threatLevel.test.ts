import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../../types";

const apiFetch = vi.fn();
vi.mock("../../lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { useEventStore } = await import("../useEventStore");

/**
 * The threat level has one source: GET /api/events/threat-analysis. The store
 * used to compute its own level from the events it happened to hold, which
 * disagreed with the server's analysis (and with itself before the events tab
 * had ever been opened).
 */

function analysis(level: 1 | 2 | 3 | 4 | 5, crit1h: number) {
  return {
    threatLevel: level,
    threatLabel: "GERİLİM",
    confidence: "MEDIUM",
    drivers: [{ factor: "ELEVATED_CONFLICT", weight: 3, description: "test" }],
    metrics: {
      criticalEventsLast1h: crit1h,
      criticalEventsLast24h: 9,
      totalEventsLast24h: 20,
      recent6hCount: 6,
      prior6hCount: 6,
      activeHotspotsCount: 4,
      corroboratedClustersCount: 2
    },
    temporalTrend: "STABLE",
    calculatedAt: "2026-09-26T08:00:00.000Z"
  };
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

function makeEvent(overrides: Partial<Event>): Event {
  return {
    id: Math.floor(Math.random() * 1e6),
    type: "kritik",
    title: "Test event",
    description: "",
    severity: "5",
    source: "Reuters World",
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

beforeEach(() => {
  apiFetch.mockReset();
  useEventStore.setState({ events: [], unreadCount: 0, threatLevel: 1, threat: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("threat level", () => {
  it("takes level and metrics from the server analysis", async () => {
    apiFetch.mockResolvedValueOnce(ok(analysis(3, 2)));

    await useEventStore.getState().fetchThreat();

    expect(apiFetch).toHaveBeenCalledWith("/api/events/threat-analysis");
    expect(useEventStore.getState().threatLevel).toBe(3);
    expect(useEventStore.getState().threat?.metrics.criticalEventsLast1h).toBe(2);
  });

  it("keeps the last analysis when a refresh fails", async () => {
    apiFetch.mockResolvedValueOnce(ok(analysis(4, 7)));
    await useEventStore.getState().fetchThreat();

    apiFetch.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) });
    await useEventStore.getState().fetchThreat();

    expect(useEventStore.getState().threatLevel).toBe(4);
    expect(useEventStore.getState().threat?.metrics.criticalEventsLast1h).toBe(7);
  });

  it("does not raise the level on its own when an event arrives", () => {
    vi.useFakeTimers();
    useEventStore.getState().addEvent(makeEvent({ severity: "5" }));

    expect(useEventStore.getState().threatLevel).toBe(1);
  });

  it("re-asks the server once for a burst of live events", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValue(ok(analysis(2, 1)));

    for (let i = 0; i < 5; i++) {
      useEventStore.getState().addEvent(makeEvent({ severity: "4" }));
    }
    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(useEventStore.getState().threatLevel).toBe(2);
  });
});

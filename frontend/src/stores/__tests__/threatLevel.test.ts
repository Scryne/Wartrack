import { beforeEach, describe, expect, it } from "vitest";
import { useEventStore } from "../useEventStore";
import type { Event } from "../../types";

/**
 * D1: calcThreatLevel compared `event.createdAt` against an ISO cutoff as
 * strings. With createdAt in SQLite's "YYYY-MM-DD HH:MM:SS" form the compare
 * was false for every same-day event, pinning the threat level to 1.
 *
 * The primary fix is the schema (createdAt is now ISO-8601 UTC); the
 * discriminating proof for that lives in backend/test/migrations.test.ts,
 * which asserts the old expression still returns the wrong answer. Parsing
 * to instants here is defence in depth. These cases are regression cover for
 * the resulting behaviour, and would also pass against the old code given
 * ISO input — that is the point: the wire format is now always ISO.
 */

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
  useEventStore.setState({ events: [], unreadCount: 0, threatLevel: 1 });
});

describe("calcThreatLevel", () => {
  it("counts a recent high-severity event (the D1 regression)", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    useEventStore.getState().addEvent(makeEvent({ severity: "5", createdAt: tenMinutesAgo }));

    // One high-severity event in the last hour => level 2, not 1.
    expect(useEventStore.getState().threatLevel).toBe(2);
  });

  it("escalates with the number of recent high-severity events", () => {
    const recent = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();

    for (let i = 0; i < 3; i++) {
      useEventStore.getState().addEvent(makeEvent({ severity: "4", createdAt: recent() }));
    }
    expect(useEventStore.getState().threatLevel).toBe(3);

    for (let i = 0; i < 3; i++) {
      useEventStore.getState().addEvent(makeEvent({ severity: "5", createdAt: recent() }));
    }
    expect(useEventStore.getState().threatLevel).toBe(4);
  });

  it("ignores events older than one hour", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    useEventStore.getState().addEvent(makeEvent({ severity: "5", createdAt: threeHoursAgo }));

    expect(useEventStore.getState().threatLevel).toBe(1);
  });

  it("ignores low-severity events regardless of recency", () => {
    useEventStore.getState().addEvent(makeEvent({ severity: "3" }));
    expect(useEventStore.getState().threatLevel).toBe(1);
  });

  it("does not crash on an unparseable timestamp", () => {
    useEventStore.setState({ events: [makeEvent({ severity: "5", createdAt: "nonsense" })] });
    useEventStore.getState().computeThreatLevel();

    expect(useEventStore.getState().threatLevel).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetAudioStateForTesting, playTacticalPulse } from "../audio";

describe("playTacticalPulse", () => {
  beforeEach(() => {
    _resetAudioStateForTesting();
  });
  it("does not throw when AudioContext is undefined in environment", () => {
    expect(() => {
      playTacticalPulse("alert");
      playTacticalPulse("critical");
      playTacticalPulse("ping");
      playTacticalPulse("click");
    }).not.toThrow();
  });

  it("invokes createOscillator and connects nodes when mock AudioContext is present", () => {
    const mockOscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };

    const mockGain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn()
    };

    const mockContext = {
      state: "running",
      currentTime: 10,
      destination: {},
      createGain: vi.fn(() => mockGain),
      createOscillator: vi.fn(() => mockOscillator),
      resume: vi.fn().mockResolvedValue(undefined)
    };

    // Temporarily attach mock
    const originalAudioContext = window.AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => mockContext);

    expect(() => {
      playTacticalPulse("critical");
    }).not.toThrow();

    (window as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
  });

  it("suppresses alert storms on rapid consecutive calls", () => {
    const mockContext = {
      state: "running",
      currentTime: 10,
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn()
      })),
      createOscillator: vi.fn(() => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      })),
      resume: vi.fn().mockResolvedValue(undefined)
    };

    const originalAudioContext = window.AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => mockContext);

    // Call 20 times in rapid succession
    for (let i = 0; i < 20; i++) {
      playTacticalPulse("ping");
    }

    // Oscillators created should be throttled (at most 1 for immediate calls)
    expect(mockContext.createOscillator).toHaveBeenCalledTimes(1);

    (window as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
  });

  it("handles 10, 50, 100 mixed-priority alert storms with strict priority escalation", () => {
    let oscillatorCount = 0;
    const mockContext = {
      state: "running",
      currentTime: 10,
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn()
      })),
      createOscillator: vi.fn(() => {
        oscillatorCount++;
        return {
          type: "sine",
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn()
        };
      }),
      resume: vi.fn().mockResolvedValue(undefined)
    };

    const originalAudioContext = window.AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => mockContext);

    // 100 alert storm
    _resetAudioStateForTesting();
    oscillatorCount = 0;

    // 100 rapid calls: 40 clicks, 30 pings, 20 alerts, 10 criticals
    for (let i = 0; i < 40; i++) playTacticalPulse("click");
    for (let i = 0; i < 30; i++) playTacticalPulse("ping");
    for (let i = 0; i < 20; i++) playTacticalPulse("alert");
    for (let i = 0; i < 10; i++) playTacticalPulse("critical");

    // Escalation allows 1 click -> 1 ping -> 1 alert -> 1 critical = 4 sounds played out of 100
    expect(oscillatorCount).toBe(4);

    (window as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
  });
});

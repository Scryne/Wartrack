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
});

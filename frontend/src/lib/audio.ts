/**
 * Tactical Web Audio synthesizer.
 *
 * Provides synthesized audio pulses for threat alerts, event pings, and UI feedback
 * without requiring external sound files or network asset loading.
 * Gracefully no-ops in SSR, test environments, or when AudioContext is unsupported/blocked.
 */

type SoundType = "critical" | "alert" | "ping" | "click";

const PRIORITY_MAP: Record<SoundType, number> = {
  critical: 4,
  alert: 3,
  ping: 2,
  click: 1
};

let sharedAudioContext: AudioContext | null = null;
let lastPlayedAt = 0;
let lastPlayedPriority = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    try {
      sharedAudioContext = new AudioCtx();
    } catch {
      return null;
    }
  }

  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume().catch(() => undefined);
  }

  return sharedAudioContext;
}

export function _resetAudioStateForTesting(): void {
  sharedAudioContext = null;
  lastPlayedAt = 0;
  lastPlayedPriority = 0;
}

export function playTacticalPulse(type: SoundType = "alert", volume = 0.15): void {
  try {
    const priority = PRIORITY_MAP[type] ?? 1;
    const nowMs = Date.now();
    const elapsed = nowMs - lastPlayedAt;

    // Alert storm suppression: throttle identical or lower priority pulses
    if (elapsed < 600 && priority <= lastPlayedPriority && priority < 4) {
      return;
    }
    if (elapsed < 300 && priority === 4 && lastPlayedPriority === 4) {
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    lastPlayedAt = nowMs;
    lastPlayedPriority = priority;

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.connect(ctx.destination);

    if (type === "critical") {
      // Urgent dual-tone pulse (880Hz -> 440Hz -> 880Hz)
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.24);

      gainNode.gain.exponentialRampToValueAtTime(Math.min(volume, 0.25), now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === "alert") {
      // Clear alert beep (660Hz)
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gainNode.gain.exponentialRampToValueAtTime(Math.min(volume, 0.2), now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (type === "ping") {
      // High-pitched tactical sonar ping (1200Hz)
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.15);

      gainNode.gain.exponentialRampToValueAtTime(Math.min(volume, 0.12), now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (type === "click") {
      // Short UI feedback click (300Hz)
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, now);

      gainNode.gain.exponentialRampToValueAtTime(Math.min(volume, 0.08), now + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {
    // Audio playback failure (e.g. autoplay restriction) must never break UI execution.
  }
}

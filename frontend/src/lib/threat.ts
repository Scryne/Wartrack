import type { ThreatLevel } from '../stores/useEventStore';

/**
 * One threat scale for every surface. The header, the threat panel and the
 * backend each had their own labels ("ILIMAN", "ORTA", "KONTROL ALTINDA" for
 * the same level); these match backend/src/services/threat.service.ts.
 */
export const THREAT_SCALE: Record<ThreatLevel, { label: string; color: string; subtle: string }> = {
  1: { label: 'DÜŞÜK', color: 'var(--color-threat-1)', subtle: 'color-mix(in srgb, var(--color-threat-1) 10%, transparent)' },
  2: { label: 'KONTROL ALTINDA', color: 'var(--color-threat-2)', subtle: 'color-mix(in srgb, var(--color-threat-2) 10%, transparent)' },
  3: { label: 'GERİLİM', color: 'var(--color-threat-3)', subtle: 'color-mix(in srgb, var(--color-threat-3) 10%, transparent)' },
  4: { label: 'YÜKSEK RİSK', color: 'var(--color-threat-4)', subtle: 'color-mix(in srgb, var(--color-threat-4) 12%, transparent)' },
  5: { label: 'KRİTİK ALARM', color: 'var(--color-threat-5)', subtle: 'color-mix(in srgb, var(--color-threat-5) 14%, transparent)' }
};

export const TREND_LABEL: Record<'ESCALATING' | 'STABLE' | 'DE-ESCALATING', string> = {
  ESCALATING: 'Tırmanıyor',
  STABLE: 'Yatay',
  'DE-ESCALATING': 'Geriliyor'
};

export const CONFIDENCE_LABEL: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'yüksek',
  MEDIUM: 'orta',
  LOW: 'düşük'
};

/** Event severity (1-5, stored as text) to the same scale's colour. */
export function severityColor(severity: string | number): string {
  const n = Math.min(5, Math.max(1, Math.round(Number(severity) || 1))) as ThreatLevel;
  return THREAT_SCALE[n].color;
}

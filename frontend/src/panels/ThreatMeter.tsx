import { useMemo } from 'react';
import { useEventStore } from '../stores/useEventStore';
import { isAtOrAfter } from '../lib/time';

const LEVELS = {
  1: { label: 'DÜŞÜK', color: '#00D084', bg: 'rgba(0,208,132,0.06)' },
  2: { label: 'ILIMAN', color: '#7CB342', bg: 'rgba(124,179,66,0.06)' },
  3: { label: 'GERİLİM', color: '#F5A623', bg: 'rgba(245,166,35,0.08)' },
  4: { label: 'YÜKSEK', color: '#FF6B00', bg: 'rgba(255,107,0,0.08)' },
  5: { label: 'KRİTİK', color: '#FF3B3B', bg: 'rgba(255,59,59,0.12)' }
} as const;

function ThreatMeter() {
  const threatLevel = useEventStore((s) => s.threatLevel);
  const events = useEventStore((s) => s.events);
  const level = LEVELS[threatLevel] ?? LEVELS[1];

  const eventCount = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return events.filter((e) => isAtOrAfter(e.createdAt, cutoff)).length;
  }, [events]);

  const critCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return events.filter((e) => Number(e.severity) >= 4 && isAtOrAfter(e.createdAt, cutoff)).length;
  }, [events]);

  return (
    <section
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '10px 14px',
        minHeight: 92,
        maxHeight: 105,
        position: 'relative',
        overflow: 'hidden',
        background: level.bg,
        border: `1px solid ${level.color}33`,
        animation: threatLevel === 5 ? 'blink-red 2s infinite' : 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1.5 }}>
          ◈ TAKTİK TEHDİT SEVİYESİ
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: level.color, letterSpacing: 0.5 }}>
          Son 24s: {critCount} kritik olay
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 56,
            lineHeight: 0.85,
            color: level.color,
            textShadow: `0 0 24px ${level.color}66`
          }}
        >
          {threatLevel}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              letterSpacing: 2,
              color: level.color,
              lineHeight: 1
            }}
          >
            {level.label}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>
            Son 1s: {eventCount} yeni olay
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 14,
          bottom: 12,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3
        }}
      >
        {[10, 16, 22, 28, 34].map((h, idx) => (
          <div
            key={h}
            style={{
              width: 5,
              borderRadius: 1,
              height: h,
              background: idx < threatLevel ? level.color : 'var(--border-strong)',
              boxShadow: idx < threatLevel ? `0 0 6px ${level.color}` : 'none',
              animation: idx < threatLevel ? 'pulse-dot 1.4s infinite' : 'none'
            }}
          />
        ))}
      </div>
    </section>
  );
}

export default ThreatMeter;


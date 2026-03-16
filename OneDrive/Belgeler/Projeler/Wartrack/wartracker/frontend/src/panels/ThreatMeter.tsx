import { useMemo } from 'react';
import { useEventStore } from '../stores/useEventStore';

const LEVELS = {
  1: { label: 'DUSUK', color: '#00D084', bg: 'rgba(0,208,132,0.04)' },
  2: { label: 'KONTROL', color: '#7CB342', bg: 'rgba(0,208,132,0.06)' },
  3: { label: 'GERILIM', color: '#F5A623', bg: 'rgba(245,166,35,0.06)' },
  4: { label: 'YUKSEK', color: '#FF6B00', bg: 'rgba(255,59,59,0.06)' },
  5: { label: 'KRITIK', color: '#FF3B3B', bg: 'rgba(255,59,59,0.1)' }
} as const;

function ThreatMeter() {
  const threatLevel = useEventStore((s) => s.threatLevel);
  const events = useEventStore((s) => s.events);
  const level = LEVELS[threatLevel];

  const eventCount = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return events.filter((e) => new Date(e.createdAt).getTime() >= cutoff).length;
  }, [events]);

  return (
    <section
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 16px',
        minHeight: 130,
        maxHeight: 130,
        position: 'relative',
        overflow: 'hidden',
        background: level.bg,
        animation: threatLevel === 5 ? 'blink-red 2s infinite' : 'none'
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: 2 }}>
        TEHDIT SEVIYESI
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 80,
            lineHeight: 0.9,
            color: level.color,
            textShadow: `0 0 30px ${level.color}66`
          }}
        >
          {threatLevel}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            letterSpacing: 3,
            color: level.color,
            opacity: 0.8
          }}
        >
          {level.label}
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3
        }}
      >
        {[12, 18, 24, 32, 40].map((h, idx) => (
          <div
            key={h}
            style={{
              width: 6,
              borderRadius: 1,
              height: h,
              background: idx < threatLevel ? level.color : 'var(--border-strong)',
              animation: idx < threatLevel ? 'pulse-dot 1.4s infinite' : 'none'
            }}
          />
        ))}
      </div>

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
        Son 1 saat · {eventCount} olay
      </span>
    </section>
  );
}

export default ThreatMeter;

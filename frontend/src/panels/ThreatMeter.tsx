import { useEffect } from 'react';
import { TrendingDown, TrendingUp, MoveRight } from 'lucide-react';
import { useEventStore } from '../stores/useEventStore';
import { CONFIDENCE_LABEL, THREAT_SCALE, TREND_LABEL } from '../lib/threat';

/** The analysis is cheap to compute server-side; one minute keeps it honest. */
const THREAT_POLL_MS = 60_000;

const TREND_ICON = {
  ESCALATING: TrendingUp,
  STABLE: MoveRight,
  'DE-ESCALATING': TrendingDown
} as const;

function ThreatMeter() {
  const threatLevel = useEventStore((s) => s.threatLevel);
  const threat = useEventStore((s) => s.threat);
  const fetchThreat = useEventStore((s) => s.fetchThreat);
  const scale = THREAT_SCALE[threatLevel];

  useEffect(() => {
    void fetchThreat();
    const timer = window.setInterval(() => void fetchThreat(), THREAT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [fetchThreat]);

  // The driver that set the level comes first; the rest are context.
  const primaryDriver = threat?.drivers[0]?.description;
  const TrendIcon = TREND_ICON[threat?.temporalTrend ?? 'STABLE'];

  return (
    <section
      className="panel wt-threat"
      style={{ borderColor: `color-mix(in srgb, ${scale.color} 35%, var(--color-border))`, background: scale.subtle }}
      aria-labelledby="wt-threat-title"
    >
      <div className="wt-threat-head">
        <h2 id="wt-threat-title" className="wt-eyebrow">
          Tehdit seviyesi
        </h2>
        {threat ? (
          <span className="wt-eyebrow" title="Çok kaynaklı teyit kümelerine göre">
            Güven: {CONFIDENCE_LABEL[threat.confidence]}
          </span>
        ) : null}
      </div>

      <div className="wt-threat-body">
        <div className="wt-threat-level">
          <span className="wt-threat-value" style={{ color: scale.color }}>
            {threatLevel}
          </span>
          <span className="wt-threat-label" style={{ color: scale.color }}>
            {scale.label}
          </span>
        </div>

        {/* Same shape before and after the first analysis: no layout shift. */}
        <dl className="wt-threat-metrics" aria-busy={!threat}>
          <div>
            <dt>Son 1 sa</dt>
            <dd>{threat ? `${threat.metrics.criticalEventsLast1h} kritik` : '—'}</dd>
          </div>
          <div>
            <dt>Son 24 sa</dt>
            <dd>{threat ? `${threat.metrics.criticalEventsLast24h} kritik` : '—'}</dd>
          </div>
          <div>
            <dt>Trend</dt>
            <dd>
              {threat ? <TrendIcon size={13} strokeWidth={1.75} aria-hidden="true" /> : null}
              {threat ? TREND_LABEL[threat.temporalTrend] : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="wt-threat-driver" title={threat?.drivers.map((d) => d.description).join('\n')}>
        {primaryDriver ?? 'Analiz bekleniyor…'}
      </p>
    </section>
  );
}

export default ThreatMeter;

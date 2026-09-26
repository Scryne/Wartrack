import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pause, Play, Sparkles } from 'lucide-react';
import { hasDisallowedScript, sanitizeTextOutput } from '../lib/textGuard';
import { apiFetch } from '../lib/api';

interface TickerSummary {
  id: number;
  source: string;
  aiSummary: string;
}

function SummaryTicker() {
  const [items, setItems] = useState<TickerSummary[]>([]);
  const [paused, setPaused] = useState(false);

  const fetchLatest = useCallback(async () => {
    try {
      const response = await apiFetch('/api/summarize/latest?limit=5');
      if (!response.ok) return;
      const data = (await response.json()) as TickerSummary[];
      if (Array.isArray(data)) {
        setItems(
          data
            .map((item) => ({
              ...item,
              aiSummary: sanitizeTextOutput(String(item.aiSummary ?? ''))
            }))
            .filter((item) => item.aiSummary.length > 0 && !hasDisallowedScript(item.aiSummary))
        );
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void fetchLatest();
    const timer = setInterval(() => void fetchLatest(), 60_000);
    return () => clearInterval(timer);
  }, [fetchLatest]);

  const stream = useMemo(() => {
    const compact = (text: string) => (text.length > 140 ? `${text.slice(0, 140).trim()}…` : text);
    if (items.length === 0) return 'Özet bekleniyor: yeni haberler yerel modelle Türkçe özetleniyor.';
    return items.map((item) => `${item.source}: ${compact(item.aiSummary)}`).join('   ·   ');
  }, [items]);

  return (
    <footer className="wt-ticker" aria-label="Son özetler">
      <span className="wt-ticker-label">
        <Sparkles size={13} strokeWidth={1.75} aria-hidden="true" />
        Son özetler
      </span>

      <div className="wt-ticker-track">
        {/* Duplicated for a seamless loop; the copy is hidden from assistive tech. */}
        <div className="wt-ticker-run" data-paused={paused}>
          <span>{stream}</span>
          <span aria-hidden="true">{stream}</span>
        </div>
      </div>

      <button
        type="button"
        className="btn-ghost wt-icon-button wt-ticker-toggle"
        aria-pressed={paused}
        aria-label={paused ? 'Kaydırmayı sürdür' : 'Kaydırmayı durdur'}
        onClick={() => setPaused((v) => !v)}
      >
        {paused ? <Play size={14} strokeWidth={1.75} /> : <Pause size={14} strokeWidth={1.75} />}
      </button>
    </footer>
  );
}

export default SummaryTicker;

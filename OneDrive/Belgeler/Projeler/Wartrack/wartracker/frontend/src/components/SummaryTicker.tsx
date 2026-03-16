import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { hasDisallowedScript, sanitizeTextOutput } from '../lib/textGuard';

interface TickerSummary {
  id: number;
  source: string;
  aiSummary: string;
}

function SummaryTicker() {
  const [items, setItems] = useState<TickerSummary[]>([]);
  const [paused, setPaused] = useState(false);
  const aiModel = useSettingsStore((s) => s.aiModel);

  const fetchLatest = useCallback(async () => {
    try {
      const response = await fetch('/api/summarize/latest?limit=5');
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
    const compact = (text: string) => (text.length > 120 ? `${text.slice(0, 120).trim()}...` : text);
    if (items.length === 0) return '◈ [SISTEM] — Turkce AI ozetleri hazirlaniyor';
    return items.map((item) => `◈ [${item.source.toUpperCase()}] — ${compact(item.aiSummary)}`).join('  ·  ');
  }, [items]);

  return (
    <footer
      style={{
        height: 'var(--ticker-h)',
        background: 'var(--bg-void)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      <div
        style={{
          borderRight: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--accent)',
          letterSpacing: 1.5,
          padding: '0 12px',
          flexShrink: 0,
          width: 80,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        ◈ AI
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            whiteSpace: 'nowrap',
            display: 'inline-block',
            animation: 'ticker-run 60s linear infinite',
            animationPlayState: paused ? 'paused' : 'running',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            color: 'var(--text-secondary)'
          }}
        >
          {stream}
          {stream}
        </div>
      </div>

      <div
        style={{
          borderLeft: '1px solid var(--border)',
          padding: '0 12px',
          flexShrink: 0,
          width: 80,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 1,
            color: aiModel === 'ollama' ? 'var(--green)' : 'var(--amber)'
          }}
        >
          {aiModel.toUpperCase()}
        </span>
        <button className="btn-ghost" onClick={() => setPaused((v) => !v)} style={{ fontSize: 11 }}>
          {paused ? '▶' : '⏸'}
        </button>
      </div>
    </footer>
  );
}

export default SummaryTicker;

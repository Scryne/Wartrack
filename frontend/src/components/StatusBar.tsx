import { useEffect, useState } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import { useConnectionStore } from '../stores/useConnectionStore';
import { useEventStore } from '../stores/useEventStore';
import { useFeedStore } from '../stores/useFeedStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import { THREAT_SCALE } from '../lib/threat';

const clockFormat = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Europe/Istanbul'
});

const StatusBar = () => {
  const connected = useConnectionStore((s) => s.connected);
  const level = useEventStore((s) => s.threatLevel);
  const { keywords, matches } = useWatchlistStore();
  const watchCount = useFeedStore((s) => s.articles.filter((a) => matches(a.title).length > 0).length);
  const threatSound = useSettingsStore((s) => s.threatSound);
  const [time, setTime] = useState(() => clockFormat.format(new Date()));
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1100);
  const scale = THREAT_SCALE[level];

  useEffect(() => {
    const t = setInterval(() => setTime(clockFormat.format(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 1100);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <header className="wt-statusbar">
      <div className="wt-statusbar-group">
        <h1 className="wt-wordmark">WARTRACKER</h1>
        {!isCompact ? <span className="wt-statusbar-meta">İRAN–İSRAİL · LEVANT</span> : null}
      </div>

      <div className="wt-statusbar-group" aria-live="polite">
        <div className="wt-threat-chip" title={`Tehdit seviyesi ${level}/5: ${scale.label}`}>
          <span className="wt-threat-chip-value" style={{ color: scale.color }}>
            {level}
          </span>
          <span className="wt-threat-chip-label">
            <span className="wt-statusbar-meta">TEHDİT</span>
            <span style={{ color: scale.color }}>{scale.label}</span>
          </span>
          <span className="wt-threat-bars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ height: 6 + i * 3, background: i <= level ? scale.color : 'var(--color-border-strong)' }} />
            ))}
          </span>
        </div>

        <span className="wt-live" data-connected={connected}>
          <span className="wt-live-dot" aria-hidden="true" />
          {connected ? 'CANLI' : 'BAĞLANTI YOK'}
        </span>
      </div>

      <div className="wt-statusbar-group">
        {keywords.length > 0 && watchCount > 0 ? (
          <span className="wt-watch-count">{watchCount} izlenen haber</span>
        ) : null}

        <button
          type="button"
          className="btn-ghost wt-icon-button"
          aria-pressed={threatSound}
          aria-label={isCompact ? 'Uyarı sesi' : undefined}
          title={threatSound ? 'Uyarı sesleri açık: kapatmak için basın' : 'Uyarı sesleri kapalı: açmak için basın'}
          onClick={() => useSettingsStore.getState().update({ threatSound: !threatSound })}
        >
          {threatSound ? <Volume2 size={16} strokeWidth={1.75} aria-hidden="true" /> : <VolumeX size={16} strokeWidth={1.75} aria-hidden="true" />}
          {!isCompact ? <span className="wt-statusbar-meta">UYARI SESİ</span> : null}
        </button>

        <time className="wt-clock" title="İstanbul saati">
          {time}
        </time>

        <button
          type="button"
          className="btn-ghost wt-icon-button"
          aria-label="Ayarları aç"
          title="Ayarlar"
          onClick={() => useSettingsStore.getState().setOpen(true)}
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
};

export default StatusBar;

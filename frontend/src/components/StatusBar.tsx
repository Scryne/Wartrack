import { useEffect, useState } from 'react';
import { useConnectionStore } from '../stores/useConnectionStore';
import { useEventStore } from '../stores/useEventStore';
import { useFeedStore } from '../stores/useFeedStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';

const COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#00D084',
  2: '#7CB342',
  3: '#F5A623',
  4: '#FF6B00',
  5: '#FF3B3B'
};

const LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'DÜŞÜK',
  2: 'ILIMAN',
  3: 'ORTA',
  4: 'YÜKSEK',
  5: 'KRİTİK'
};

const StatusBar = () => {
  const connected = useConnectionStore((s) => s.connected);
  const level = useEventStore((s) => s.threatLevel);
  const { keywords, matches } = useWatchlistStore();
  const watchCount = useFeedStore((s) =>
    s.articles.filter((a) => matches(a.title).length > 0).length
  );
  const threatSound = useSettingsStore((s) => s.threatSound);
  const [time, setTime] = useState('');
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1100);

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString('tr-TR', { hour12: false }));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 1100);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <header
      style={{
        height: 'var(--status-h)',
        background: 'var(--bg-void)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
        zIndex: 100
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            letterSpacing: 4,
            color: 'var(--text-primary)',
            lineHeight: 1
          }}
        >
          WARTRACKER
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--accent)',
            border: '1px solid rgba(0,170,255,0.3)',
            padding: '2px 6px',
            borderRadius: '2px',
            letterSpacing: 1
          }}
        >
          v3.0
        </span>
        <div style={{ width: 1, height: 16, background: 'var(--border-strong)' }} />
        {!isCompact ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-muted)',
              letterSpacing: 1
            }}
          >
            IRAN - ISRAIL
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          position: isCompact ? 'static' : 'absolute',
          left: isCompact ? undefined : '50%',
          transform: isCompact ? undefined : 'translateX(-50%)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingRight: 2,
            borderRight: '1px solid var(--border-strong)'
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              lineHeight: 1,
              color: COLORS[level],
              textShadow: `0 0 16px ${COLORS[level]}66`
            }}
          >
            {level}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                letterSpacing: 1.2,
                color: 'var(--text-muted)'
              }}
            >
              TEHDİT
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 0.8,
                color: COLORS[level]
              }}
            >
              {LABELS[level]}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            {[8, 11, 14, 17, 20].map((h, i) => (
              <div
                key={h}
                style={{
                  width: 3,
                  height: h,
                  borderRadius: 1,
                  background: i < level ? COLORS[level] : 'var(--border-strong)',
                  opacity: i < level ? 1 : 0.7
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: connected ? 'var(--green)' : 'var(--red)',
              animation: connected ? 'pulse-dot 2s infinite' : 'none'
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: connected ? 'var(--green)' : 'var(--red)',
              letterSpacing: 1
            }}
          >
            {connected ? 'CANLI' : 'BAGLANTI YOK'}
          </span>
        </div>

        {!isCompact ? <div style={{ width: 1, height: 14, background: 'var(--border-strong)' }} /> : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {keywords.length > 0 && watchCount > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 10px',
              borderLeft: '1px solid var(--border)',
              borderRight: '1px solid var(--border)'
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#F5A623'
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: '#F5A623',
                letterSpacing: 0.5
              }}
            >
              {watchCount} izleme
            </span>
          </div>
        ) : null}

        {/* Global Sound Mute Toggle */}
        <button
          className="btn-ghost"
          onClick={() => {
            useSettingsStore.getState().update({ threatSound: !threatSound });
          }}
          title={threatSound ? 'Taktik sesleri kapat' : 'Taktik sesleri aç'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            padding: '3px 8px',
            fontFamily: 'var(--font-mono)',
            color: threatSound ? 'var(--accent)' : 'var(--text-muted)'
          }}
        >
          <span>{threatSound ? '🔊' : '🔇'}</span>
          {!isCompact ? <span style={{ fontSize: 9 }}>{threatSound ? 'SES AÇIK' : 'SESSİZ'}</span> : null}
        </button>

        {/* Theme Selector */}
        <select
          defaultValue={localStorage.getItem('wartracker-theme') ?? 'dark'}
          onChange={(e) => {
            const val = e.target.value;
            localStorage.setItem('wartracker-theme', val);
            if (val === 'dark') {
              document.documentElement.removeAttribute('data-theme');
            } else {
              document.documentElement.setAttribute('data-theme', val);
            }
          }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 6px',
            cursor: 'pointer',
            outline: 'none'
          }}
          title="Taktik Arayüz Teması"
        >
          <option value="dark">DARK HUD</option>
          <option value="nvg">NVG YEŞİL</option>
          <option value="amber">FLIR AMBER</option>
        </select>

        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            letterSpacing: 1.5,
            minWidth: 62,
            textAlign: 'center'
          }}
        >
          {time}
        </span>

        <button
          className="btn-ghost"
          onClick={() => useSettingsStore.getState().setOpen(true)}
          title="Ayarlar"
          style={{ fontSize: 15, padding: '4px 8px' }}
        >
          ⚙
        </button>
      </div>
    </header>
  );
};

export default StatusBar;

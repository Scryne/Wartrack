import { useState, useEffect, useMemo } from 'react';

export interface StreamChannel {
  id: string;
  name: string;
  category: string;
  embedUrl: string;
  externalUrl: string;
}

export const PRESET_CHANNELS: StreamChannel[] = [
  {
    id: 'aljazeera-en',
    name: 'Al Jazeera EN',
    category: 'HABER',
    embedUrl: 'https://www.youtube.com/embed/gCNeDWCI0wo?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=gCNeDWCI0wo'
  },
  {
    id: 'aljazeera-ar',
    name: 'Al Jazeera AR',
    category: 'HABER',
    embedUrl: 'https://www.youtube.com/embed/bNyUyrR0PHo?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=bNyUyrR0PHo'
  },
  {
    id: 'france24-en',
    name: 'France 24 EN',
    category: 'HABER',
    embedUrl: 'https://www.youtube.com/embed/h3MuIUNCCzI?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=h3MuIUNCCzI'
  },
  {
    id: 'france24-ar',
    name: 'France 24 AR',
    category: 'HABER',
    embedUrl: 'https://www.youtube.com/embed/l8PMl7tUDIE?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=l8PMl7tUDIE'
  },
  {
    id: 'skynews',
    name: 'Sky News Live',
    category: 'HABER',
    embedUrl: 'https://www.youtube.com/embed/9Auq9mYxFEE?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=9Auq9mYxFEE'
  },
  {
    id: 'dw-en',
    name: 'DW News EN',
    category: 'HABER',
    embedUrl: 'https://www.youtube.com/embed/lu_Z7BPbK70?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=lu_Z7BPbK70'
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg TV',
    category: 'FINANS / HABER',
    embedUrl: 'https://www.youtube.com/embed/dp8PhLsUcFE?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=dp8PhLsUcFE'
  },
  {
    id: 'tactical-default',
    name: 'WARTRACKER Taktik',
    category: 'IZLEME',
    embedUrl: 'https://www.youtube.com/embed/4E-iFtUM2kk?autoplay=1&mute=1&rel=0&modestbranding=1',
    externalUrl: 'https://www.youtube.com/watch?v=4E-iFtUM2kk'
  }
];

const STORAGE_KEY = 'wartracker-selected-stream';
const CUSTOM_URL_KEY = 'wartracker-custom-stream-url';

function extractYoutubeEmbed(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://www.youtube.com/embed/')) return trimmed;

  const vMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch) return `https://www.youtube.com/embed/${vMatch[1]}?autoplay=1&mute=1&rel=0`;

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1&mute=1&rel=0`;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/embed/${trimmed}?autoplay=1&mute=1&rel=0`;
  }

  return trimmed.startsWith('http') ? trimmed : null;
}

function MediaPanel() {
  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? PRESET_CHANNELS[0].id;
  });
  const [customUrl, setCustomUrl] = useState<string>(() => {
    return localStorage.getItem(CUSTOM_URL_KEY) ?? '';
  });
  const [showCustomInput, setShowCustomInput] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedId);
  }, [selectedId]);

  const activeChannel = useMemo(() => {
    if (selectedId === 'custom') {
      const embed = extractYoutubeEmbed(customUrl);
      return {
        id: 'custom',
        name: 'Özel Akış',
        category: 'OZEL',
        embedUrl: embed ?? PRESET_CHANNELS[0].embedUrl,
        externalUrl: customUrl || PRESET_CHANNELS[0].externalUrl
      };
    }
    return PRESET_CHANNELS.find((c) => c.id === selectedId) ?? PRESET_CHANNELS[0];
  }, [selectedId, customUrl]);

  const handleSaveCustomUrl = (val: string) => {
    setCustomUrl(val);
    localStorage.setItem(CUSTOM_URL_KEY, val);
  };

  return (
    <section className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="panel-header"
        style={{
          height: 34,
          minHeight: 34,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--red)',
              boxShadow: '0 0 6px var(--red)',
              animation: 'blink-red 1.5s infinite'
            }}
          />
          <span className="panel-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 1 }}>
            CANLI YAYIN
          </span>
          <select
            value={selectedId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedId(val);
              if (val === 'custom') setShowCustomInput(true);
              else setShowCustomInput(false);
            }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              background: 'var(--bg-void)',
              color: 'var(--accent)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              cursor: 'pointer',
              outline: 'none',
              maxWidth: 130
            }}
          >
            {PRESET_CHANNELS.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
            <option value="custom">+ Özel URL...</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedId === 'custom' && (
            <button
              className="btn-ghost"
              onClick={() => setShowCustomInput((v) => !v)}
              style={{ fontSize: 10, padding: '2px 6px' }}
              title="Özel URL'yi düzenle"
            >
              ⚙
            </button>
          )}
          <a
            href={activeChannel.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Aç ↗
          </a>
        </div>
      </div>

      {showCustomInput && selectedId === 'custom' && (
        <div
          style={{
            padding: '6px 10px',
            background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: 6
          }}
        >
          <input
            type="text"
            placeholder="YouTube canlı yayın linki veya Video ID..."
            value={customUrl}
            onChange={(e) => handleSaveCustomUrl(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-void)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '4px 8px',
              outline: 'none'
            }}
          />
          <button
            className="btn-ghost"
            onClick={() => setShowCustomInput(false)}
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            Tamam
          </button>
        </div>
      )}

      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0 }}>
        <iframe
          key={activeChannel.embedUrl}
          width="100%"
          height="100%"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          src={activeChannel.embedUrl}
          title={`WARTRACKER ${activeChannel.name}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </section>
  );
}

export default MediaPanel;

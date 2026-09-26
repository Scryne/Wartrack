import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';

export interface StreamChannel {
  id: string;
  name: string;
  category: string;
  embedUrl: string;
  externalUrl: string;
}

const EMBED_PARAMS = 'autoplay=1&mute=1&rel=0&modestbranding=1';

/**
 * A 24/7 broadcast gets a new video ID whenever the channel restarts it, so a
 * hard-coded ID eventually shows "video unavailable" (four of eight had done so
 * by 2026-09). Where YouTube serves it, the channel form
 * (embed/live_stream?channel=) follows the current broadcast by itself; the
 * others pin today's ID. externalUrl always points at the channel's /live page,
 * which never goes stale, so "Aç" still works after an embed ID has rotted.
 */
// youtube-nocookie.com: YouTube's privacy-enhanced embed host. Same player,
// no tracking cookies set by merely opening the dashboard.
const EMBED_HOST = 'https://www.youtube-nocookie.com/embed';
const byChannel = (channelId: string) => `${EMBED_HOST}/live_stream?channel=${channelId}&${EMBED_PARAMS}`;
const byVideo = (videoId: string) => `${EMBED_HOST}/${videoId}?${EMBED_PARAMS}`;
const livePage = (handle: string) => `https://www.youtube.com/@${handle}/live`;

export const PRESET_CHANNELS: StreamChannel[] = [
  {
    id: 'aljazeera-en',
    name: 'Al Jazeera EN',
    category: 'HABER',
    embedUrl: byChannel('UCNye-wNBqNL5ZzHSJj3l8Bg'),
    externalUrl: livePage('aljazeeraenglish')
  },
  {
    id: 'aljazeera-ar',
    name: 'Al Jazeera AR',
    category: 'HABER',
    embedUrl: byVideo('N8xxOD0nT1Y'),
    externalUrl: livePage('aljazeera')
  },
  {
    id: 'france24-en',
    name: 'France 24 EN',
    category: 'HABER',
    embedUrl: byVideo('HvZt-nh9sGg'),
    externalUrl: livePage('France24_en')
  },
  {
    id: 'france24-fr',
    name: 'France 24 FR',
    category: 'HABER',
    embedUrl: byVideo('a47ckXKZjxI'),
    externalUrl: livePage('FRANCE24')
  },
  {
    id: 'skynews',
    name: 'Sky News',
    category: 'HABER',
    embedUrl: byVideo('SPtvJn-RRZE'),
    externalUrl: livePage('SkyNews')
  },
  {
    id: 'dw-en',
    name: 'DW News EN',
    category: 'HABER',
    embedUrl: byChannel('UCknLrEdhRCp1aegoMqRaCZg'),
    externalUrl: livePage('dwnews')
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg TV',
    category: 'FİNANS / HABER',
    embedUrl: byVideo('QB5BNdBFujE'),
    externalUrl: livePage('markets')
  },
  {
    // Third-party OSINT channel re-streaming public city cameras in the region.
    id: 'intel-cams',
    name: 'Bölge Kameraları',
    category: 'İZLEME',
    embedUrl: byVideo('5WPpZzGcFnI'),
    externalUrl: livePage('intelcamslive')
  }
];

const STORAGE_KEY = 'wartracker-selected-stream';
const CUSTOM_URL_KEY = 'wartracker-custom-stream-url';

function extractYoutubeEmbed(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://www.youtube.com/embed/')) return trimmed.replace('https://www.youtube.com/embed', EMBED_HOST);
  if (trimmed.startsWith(`${EMBED_HOST}/`)) return trimmed;

  const vMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch) return byVideo(vMatch[1]);

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return byVideo(shortMatch[1]);

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return byVideo(trimmed);
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
        name: 'Özel yayın',
        category: 'ÖZEL',
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
    <section className="panel" aria-labelledby="wt-media-title">
      <div className="panel-header wt-media-header">
        <div className="wt-panel-heading">
          <span className="wt-live-dot wt-media-dot" aria-hidden="true" />
          <h2 id="wt-media-title" className="panel-title">
            Canlı yayın
          </h2>
          <label className="sr-only" htmlFor="wt-media-channel">
            Yayın kanalı
          </label>
          <select
            id="wt-media-channel"
            className="wt-select"
            value={selectedId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedId(val);
              setShowCustomInput(val === 'custom');
            }}
          >
            {PRESET_CHANNELS.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
            <option value="custom">Başka bir yayın…</option>
          </select>
        </div>

        <div className="wt-panel-heading">
          {selectedId === 'custom' ? (
            <button
              type="button"
              className="btn-ghost wt-icon-button"
              aria-expanded={showCustomInput}
              aria-label="Yayın bağlantısını düzenle"
              onClick={() => setShowCustomInput((v) => !v)}
            >
              <Link2 size={15} strokeWidth={1.75} />
            </button>
          ) : null}
          <a
            className="btn-ghost wt-icon-button"
            href={activeChannel.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${activeChannel.name} yayınını YouTube'da aç`}
            title="YouTube'da aç"
          >
            <ExternalLink size={15} strokeWidth={1.75} />
          </a>
        </div>
      </div>

      {showCustomInput && selectedId === 'custom' ? (
        <div className="wt-media-custom">
          <label className="wt-search">
            <span className="sr-only">YouTube bağlantısı veya video kimliği</span>
            <input
              type="url"
              placeholder="YouTube bağlantısı veya 11 karakterlik video kimliği"
              value={customUrl}
              onChange={(e) => handleSaveCustomUrl(e.target.value)}
            />
          </label>
          <button type="button" className="btn-secondary wt-btn-sm" onClick={() => setShowCustomInput(false)}>
            Yayını aç
          </button>
        </div>
      ) : null}

      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0 }}>
        <iframe
          key={activeChannel.embedUrl}
          width="100%"
          height="100%"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          src={activeChannel.embedUrl}
          title={`Canlı yayın: ${activeChannel.name}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          // YouTube refuses to play embeds that arrive without a referrer
          // (player error 153); pin the policy so a stricter site-wide default
          // cannot silently break every stream.
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </section>
  );
}

export default MediaPanel;

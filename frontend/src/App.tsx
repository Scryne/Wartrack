import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Newspaper, Siren } from 'lucide-react';
import StatusBar from './components/StatusBar';
import SummaryTicker from './components/SummaryTicker';
import SettingsModal from './components/SettingsModal';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';
import { useSocket } from './hooks/useSocket';
import { useBookmarkStore } from './stores/useBookmarkStore';
import { useOverlayStore } from './stores/useOverlayStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { apiFetch } from './lib/api';
import { describeBriefSource } from './lib/brief';

import { DesignTokensView } from './components/DesignTokensView';

const MapPanel = lazy(() => import('./panels/MapPanel'));
const FeedPanel = lazy(() => import('./panels/FeedPanel'));
const MediaPanel = lazy(() => import('./panels/MediaPanel'));
const ThreatMeter = lazy(() => import('./panels/ThreatMeter'));
const EventLog = lazy(() => import('./panels/EventLog'));
const BRIEF_CACHE_MS = 120000;

// Placeholders take the final size of what they stand in for; a full-height
// placeholder collapsing to the real card was the page's main layout shift.
const Skeleton = ({ label, className = '' }: { label: string; className?: string }) => (
  <div className={`panel wt-skeleton ${className}`} aria-busy="true" aria-label={`${label} yükleniyor`} />
);

const App = () => {
  const isDesignTokens =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/design-tokens' || window.location.hash === '#design-tokens');

  useSocket();
  const [sidebarTab, setSidebarTab] = useState<'feed' | 'events'>('feed');
  const fetchBookmarks = useBookmarkStore((s) => s.fetchBookmarks);
  const [showBrief, setShowBrief] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [briefModel, setBriefModel] = useState('');
  const [briefGeneratedAt, setBriefGeneratedAt] = useState('');
  const commandPaletteOpen = useOverlayStore((s) => s.commandPaletteOpen);
  const openCommandPalette = useOverlayStore((s) => s.openCommandPalette);
  const closeCommandPalette = useOverlayStore((s) => s.closeCommandPalette);
  const briefAbortRef = useRef<AbortController | null>(null);
  const briefFetchedAtRef = useRef(0);

  const fetchBrief = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && briefText && now - briefFetchedAtRef.current < BRIEF_CACHE_MS) {
      return;
    }

    briefAbortRef.current?.abort();
    const controller = new AbortController();
    briefAbortRef.current = controller;
    setBriefLoading(true);

    try {
      const res = await apiFetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
        signal: controller.signal
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const message = typeof errJson?.message === 'string' ? errJson.message : `HTTP ${res.status}`;
        throw new Error(message);
      }

      const json = await res.json();
      setBriefText(String(json?.brief ?? ''));
      setBriefModel(describeBriefSource(String(json?.model ?? ''), json?.modelName ? String(json.modelName) : undefined));
      setBriefGeneratedAt(String(json?.generatedAt ?? new Date().toISOString()));
      briefFetchedAtRef.current = Date.now();
    } catch (err) {
      if (controller.signal.aborted) return;

      // Say what failed, not what the brief would have said: the previous
      // text reported "no critical event" whenever the request itself failed.
      const reason = err instanceof Error && err.message ? err.message : 'Servis yanıt vermedi';
      setBriefText(`## SON 6 SAATİN ÖZETİ
- Durum özeti alınamadı: ${reason}. Sunucu bağlantısını ve API anahtarını kontrol edip Yenile'ye basın.`);
      setBriefModel(describeBriefSource('error'));
      setBriefGeneratedAt(new Date().toISOString());
    } finally {
      if (briefAbortRef.current === controller) {
        briefAbortRef.current = null;
        setBriefLoading(false);
      }
    }
  }, [briefText]);

  const openBrief = useCallback(() => {
    setShowBrief(true);
    void fetchBrief();
  }, [fetchBrief]);

  useEffect(() => {
    return () => {
      briefAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // The NVG/FLIR theme picker had no styles behind it and was removed;
    // drop the stored choice so it cannot resurface as a stray attribute.
    try {
      localStorage.removeItem('wartracker-theme');
    } catch {
      // storage unavailable (private mode): nothing to clean
    }
  }, []);

  useEffect(() => {
    if (!showBrief) return;
    const timer = window.setInterval(() => {
      void fetchBrief(true);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [showBrief, fetchBrief]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (inEditable) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey && key === 'k') || (event.shiftKey && key === 'p')) {
        event.preventDefault();
        openCommandPalette();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCommandPalette]);

  useEffect(() => {
    void fetchBookmarks();
  }, [fetchBookmarks]);

  useEffect(() => {
    void useSettingsStore.getState().hydrate();
  }, []);

  if (isDesignTokens) {
    return <DesignTokensView onClose={() => { window.location.href = '/'; }} />;
  }

  return (
    <div className="wt-app">
      <StatusBar />
      <SettingsModal />

      <main className="wt-main">
        <ErrorBoundary>
          <Suspense fallback={<Skeleton label="Harita" className="wt-main-map" />}>
            <div className="wt-main-map">
              <MapPanel
                showBrief={showBrief}
                briefLoading={briefLoading}
                briefText={briefText}
                briefModel={briefModel}
                briefGeneratedAt={briefGeneratedAt}
                onCloseBrief={() => setShowBrief(false)}
                onRefreshBrief={() => void fetchBrief(true)}
              />
            </div>
          </Suspense>
        </ErrorBoundary>

        <div className="wt-main-rail">
          <ErrorBoundary>
            <Suspense fallback={<Skeleton label="Tehdit seviyesi" className="wt-threat" />}>
              <ThreatMeter />
            </Suspense>
          </ErrorBoundary>

          <div className="wt-main-media">
            <ErrorBoundary>
              <Suspense fallback={<Skeleton label="Canlı yayın" />}>
                <MediaPanel />
              </Suspense>
            </ErrorBoundary>
          </div>

          <div className="segment-container" role="tablist" aria-label="Sağ panel" style={{ flexShrink: 0 }}>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'feed'}
              className={`segment-item${sidebarTab === 'feed' ? ' segment-item-active' : ''}`}
              onClick={() => setSidebarTab('feed')}
            >
              <Newspaper size={14} strokeWidth={1.75} aria-hidden="true" />
              Haber akışı
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'events'}
              className={`segment-item${sidebarTab === 'events' ? ' segment-item-active' : ''}`}
              onClick={() => setSidebarTab('events')}
            >
              <Siren size={14} strokeWidth={1.75} aria-hidden="true" />
              Kritik olaylar
            </button>
          </div>

          <div className="wt-main-feed">
            <ErrorBoundary>
              <Suspense fallback={<Skeleton label={sidebarTab === 'feed' ? 'Haberler' : 'Kritik olaylar'} />}>
                {sidebarTab === 'feed' ? <FeedPanel onOpenBrief={openBrief} /> : <EventLog />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </main>

      <SummaryTicker />
      <CommandPalette open={commandPaletteOpen} onClose={closeCommandPalette} />
      <ToastContainer />
    </div>
  );
};

export default App;

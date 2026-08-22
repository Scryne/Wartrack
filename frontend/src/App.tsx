import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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

const MapPanel = lazy(() => import('./panels/MapPanel'));
const FeedPanel = lazy(() => import('./panels/FeedPanel'));
const MediaPanel = lazy(() => import('./panels/MediaPanel'));
const BRIEF_CACHE_MS = 120000;

const Skeleton = ({ label }: { label: string }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)',
      letterSpacing: 2
    }}
  >
    {label}
  </div>
);

const App = () => {
  useSocket();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
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
      setBriefModel(String(json?.model ?? ''));
      setBriefGeneratedAt(String(json?.generatedAt ?? new Date().toISOString()));
      briefFetchedAtRef.current = Date.now();
    } catch (err) {
      if (controller.signal.aborted) return;

      const reason = err instanceof Error && err.message ? err.message : 'Servis yanıt vermedi';
      setBriefText(`## SON 6 SAATİN ÖZETİ
- AI durum özeti alınamadı.

## KRİTİK GELİŞME
Kritik düzeyde olay tespit edilmedi.

## TREND ANALİZİ
Durum özeti servisi geçici olarak erişilemez (${reason}).`);
      setBriefModel('none');
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
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-void)',
        padding: 'var(--gap)',
        gap: 'var(--gap)'
      }}
    >
      <StatusBar />
      <SettingsModal />

      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: 'var(--gap)',
          minHeight: 0,
          flexDirection: isMobile ? 'column' : 'row'
        }}
      >
        <ErrorBoundary>
          <Suspense fallback={<Skeleton label="HARITA" />}>
            <div style={{ flex: isMobile ? '1 1 auto' : '2.2', minWidth: 0, minHeight: isMobile ? 280 : 0 }}>
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

        <div style={{ flex: isMobile ? '1 1 auto' : '1.3', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          <ErrorBoundary>
            <Suspense fallback={<Skeleton label="YAYIN" />}>
              <div style={{ height: isMobile ? 160 : 210, flexShrink: 0, minHeight: 0 }}>
                <MediaPanel />
              </div>
            </Suspense>
          </ErrorBoundary>

          <ErrorBoundary>
            <Suspense fallback={<Skeleton label="HABERLER" />}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <FeedPanel onOpenBrief={openBrief} />
              </div>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <SummaryTicker />
      <CommandPalette open={commandPaletteOpen} onClose={closeCommandPalette} />
      <ToastContainer />
    </div>
  );
};

export default App;

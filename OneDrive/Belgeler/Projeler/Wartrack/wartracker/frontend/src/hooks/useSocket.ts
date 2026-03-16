import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { useFeedStore } from '../stores/useFeedStore';
import { useEventStore } from '../stores/useEventStore';
import { useMapStore } from '../stores/useMapStore';
import { useConnectionStore } from '../stores/useConnectionStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { Article, Event as WarEvent, Pin } from '../types';

function playAlertBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 920;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    return;
  }
}

export function useSocket(): void {
  useEffect(() => {
    const setConnected = (connected: boolean) => {
      useConnectionStore.getState().setConnected(connected);
    };

    const onInit = (payload: { threat_level: 1 | 2 | 3 | 4 | 5 }) => {
      useEventStore.getState().setThreatLevel(payload.threat_level);
      void useEventStore.getState().fetchStats();
    };

    const onArticleNew = (article: Article) => {
      useFeedStore.getState().prependArticle(article);

      const candidate = article as Article & {
        lat?: unknown;
        lng?: unknown;
      };
      if (typeof candidate.lat === 'number' && typeof candidate.lng === 'number') {
        useMapStore.getState().addNewsPin({
          id: article.id,
          title: article.title,
          source: article.source,
          pubDate: article.pubDate,
          category: article.category,
          link: article.link,
          aiSummary: article.aiSummary,
          reliabilityScore: article.reliabilityScore,
          confidenceLabel: article.confidenceLabel,
          reliabilitySignals: article.reliabilitySignals,
          insufficientData: article.insufficientData,
          lat: candidate.lat,
          lng: candidate.lng
        });
      }
    };

    const onArticleSummarized = (data: { id: number; aiSummary: string }) => {
      useFeedStore.getState().updateArticleSummary(data.id, data.aiSummary);
      void useMapStore.getState().fetchNewsPins();
    };

    const onEventNew = (event: WarEvent) => {
      useEventStore.getState().addEvent(event);
      const threatSound = useSettingsStore.getState().threatSound;
      if (threatSound && Number(event.severity) >= 4) {
        playAlertBeep();
      }
    };

    const onPinCreated = async (pin: Partial<Pin>) => {
      if (typeof pin.id === 'number' && typeof pin.lat === 'number' && typeof pin.lng === 'number') {
        const existing = useMapStore.getState().pins.find((current) => current.id === pin.id);
        if (!existing) {
          void fetch('/api/pins')
            .then((response) => response.json())
            .then((pinsPayload: Pin[]) => useMapStore.getState().setPins(pinsPayload))
            .catch(() => undefined);
        }
      }
    };

    const onPinDeleted = (data: { id: number }) => {
      useMapStore.getState().deletePinLocal(data.id);
    };

    const onPinUpdated = (data: { id: number; title: string; description: string; category: Pin['category'] }) => {
      const store = useMapStore.getState();
      const current = store.pins.find((pin) => pin.id === data.id);
      if (!current) return;
      store.updatePinLocal({
        ...current,
        title: data.title,
        description: data.description,
        category: data.category
      });
    };

    const onStatsUpdate = () => {
      void useEventStore.getState().fetchStats();
    };

    const onThreatUpdate = (data: { level: 1 | 2 | 3 | 4 | 5 }) => {
      useEventStore.getState().setThreatLevel(data.level);
    };

    const onFeedRefreshed = () => {
      void useFeedStore.getState().fetchArticles();
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('init', onInit);
    socket.on('article:new', onArticleNew);
    socket.on('article:summarized', onArticleSummarized);
    socket.on('event:new', onEventNew);
    socket.on('pin:created', onPinCreated);
    socket.on('pin:deleted', onPinDeleted);
    socket.on('pin:updated', onPinUpdated);
    socket.on('stats:update', onStatsUpdate);
    socket.on('threat:update', onThreatUpdate);
    socket.on('feed:refreshed', onFeedRefreshed);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('init', onInit);
      socket.off('article:new', onArticleNew);
      socket.off('article:summarized', onArticleSummarized);
      socket.off('event:new', onEventNew);
      socket.off('pin:created', onPinCreated);
      socket.off('pin:deleted', onPinDeleted);
      socket.off('pin:updated', onPinUpdated);
      socket.off('stats:update', onStatsUpdate);
      socket.off('threat:update', onThreatUpdate);
      socket.off('feed:refreshed', onFeedRefreshed);
      setConnected(false);
    };
  }, []);
}

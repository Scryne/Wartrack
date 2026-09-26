import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { useFeedStore } from '../stores/useFeedStore';
import { useEventStore } from '../stores/useEventStore';
import { useMapStore } from '../stores/useMapStore';
import { useConnectionStore } from '../stores/useConnectionStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { Article, Event as WarEvent, Pin } from '../types';
import { apiFetch } from '../lib/api';

import { playTacticalPulse } from '../lib/audio';

export function useSocket(): void {
  useEffect(() => {
    const setConnected = (connected: boolean) => {
      useConnectionStore.getState().setConnected(connected);
    };

    const onInit = (payload: { threat_level: 1 | 2 | 3 | 4 | 5 }) => {
      useEventStore.getState().setThreatLevel(payload.threat_level);
      void useEventStore.getState().fetchStats();
      void useEventStore.getState().fetchThreat();
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
      if (threatSound) {
        const sev = Number(event.severity);
        if (sev >= 5) playTacticalPulse("critical");
        else if (sev >= 4) playTacticalPulse("alert");
        else if (sev >= 3) playTacticalPulse("ping");
      }
    };

    const onPinCreated = async (pin: Partial<Pin>) => {
      if (typeof pin.id === 'number' && typeof pin.lat === 'number' && typeof pin.lng === 'number') {
        const existing = useMapStore.getState().pins.find((current) => current.id === pin.id);
        if (!existing) {
          void apiFetch('/api/pins')
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
      void useEventStore.getState().fetchThreat();
    };

    const onThreatUpdate = (data: { level: 1 | 2 | 3 | 4 | 5 }) => {
      const prevLevel = useEventStore.getState().threatLevel;
      useEventStore.getState().setThreatLevel(data.level);
      const threatSound = useSettingsStore.getState().threatSound;
      if (threatSound && data.level > prevLevel && data.level >= 4) {
        playTacticalPulse("critical");
      }
    };

    const onFeedRefreshed = () => {
      void useFeedStore.getState().fetchArticles();
    };

    // The backend has always emitted this; nothing listened, so a settings
    // change in one browser never reached another.
    const onSettingsUpdated = (payload: { key: string; value: unknown } | Record<string, unknown>) => {
      const settings =
        payload && typeof payload === 'object' && 'key' in payload && typeof payload.key === 'string'
          ? { [payload.key]: (payload as { value: unknown }).value }
          : (payload as Record<string, unknown>);
      useSettingsStore.getState().applyServerSettings(settings);
    };

    const onConnectError = (err: Error) => {
      setConnected(false);
      console.warn('[SOCKET] Baglanti hatasi:', err.message);
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', onConnectError);
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
    socket.on('settings:updated', onSettingsUpdated);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error', onConnectError);
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
      socket.off('settings:updated', onSettingsUpdated);
      setConnected(false);
    };
  }, []);
}

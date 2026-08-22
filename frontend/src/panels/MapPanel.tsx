import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer } from 'react-leaflet';
import DrawToolbar from '../components/DrawToolbar';
import PinDrawer from '../components/PinDrawer';
import MapLegend from '../components/MapLegend';
import AiBriefPanel from './AiBriefPanel';
import { NUCLEAR_SITES } from '../data/nuclearSites';
import { SAM_SYSTEMS } from '../data/samSystems';
import { showConfirmToast } from '../lib/toast';
import { apiFetch } from '../lib/api';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { useMapStore } from '../stores/useMapStore';
import { useDrawStore } from '../stores/useDrawStore';
import { useLayerStore } from '../stores/useLayerStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import type { Pin } from '../types';
import { DrawController } from './mapPanel/DrawController';
import { CursorTracker, MapBootstrap, ViewportSync } from './mapPanel/helpers';
import { WORKSPACES, createNewsPinIcon, escapeHtml, isCritical, manualIcon, toSafeUrl } from './mapPanel/mapUtils';

interface MapPanelProps {
  showBrief: boolean;
  briefLoading: boolean;
  briefText: string;
  briefModel: string;
  briefGeneratedAt: string;
  onCloseBrief: () => void;
  onRefreshBrief: () => void;
}

function MapPanel({
  showBrief,
  briefLoading,
  briefText,
  briefModel,
  briefGeneratedAt,
  onCloseBrief,
  onRefreshBrief
}: MapPanelProps) {
  const pins = useMapStore((s) => s.pins);
  const newsPins = useMapStore((s) => s.newsPins);
  const mapCenter = useMapStore((s) => s.mapCenter);
  const zoom = useMapStore((s) => s.zoom);
  const activeWorkspace = useMapStore((s) => s.activeWorkspace);
  const bookmarkIds = useBookmarkStore((s) => s.ids);
  const setPins = useMapStore((s) => s.setPins);
  const setActiveWorkspace = useMapStore((s) => s.setActiveWorkspace);
  const openDrawer = useMapStore((s) => s.openDrawer);
  const pinDrawerOpen = useMapStore((s) => s.pinDrawerOpen);
  const fetchNewsPins = useMapStore((s) => s.fetchNewsPins);
  const legendFilters = useMapStore((s) => s.legendFilters);
  const hoveredLegendKey = useMapStore((s) => s.hoveredLegendKey);
  const toggleLegendFilter = useMapStore((s) => s.toggleLegendFilter);
  const clearLegendFilters = useMapStore((s) => s.clearLegendFilters);
  const setHoveredLegendKey = useMapStore((s) => s.setHoveredLegendKey);
  const mapRef = useRef<L.Map | null>(null);
  const newsPinsLayerRef = useRef(L.layerGroup());
  const manualPinsLayer = useRef(L.layerGroup());
  const drawLayerRef = useRef(L.layerGroup());
  const nuclearLayerRef = useRef(L.layerGroup());
  const samLayerRef = useRef(L.layerGroup());
  const drawActive = useDrawStore((s) => s.active);
  const toggleDraw = useDrawStore((s) => s.toggle);
  const showNuclear = useLayerStore((s) => s.nuclear);
  const showSam = useLayerStore((s) => s.sam);
  const toggleLayer = useLayerStore((s) => s.toggle);

  const [coords, setCoords] = useState<[number, number]>([37.4888, 42.6935]);
  const [pinMode, setPinMode] = useState(false);
  const [draftLatLng, setDraftLatLng] = useState<[number, number] | null>(null);

  const workspace = useMemo(
    () => WORKSPACES.find((ws) => ws.id === activeWorkspace) ?? WORKSPACES[0],
    [activeWorkspace]
  );

  const handlePick = useCallback((latlng: [number, number]) => {
    setDraftLatLng(latlng);
    openDrawer();
  }, [openDrawer]);

  useEffect(() => {
    void apiFetch('/api/pins')
      .then((r) => r.json())
      .then((list: Pin[]) => setPins(list))
      .catch(() => undefined);
    void fetchNewsPins();
  }, [setPins, fetchNewsPins]);

  useEffect(() => {
    const onAddPin = () => {
      setPinMode(true);
      if (mapRef.current) {
        const center = mapRef.current.getCenter();
        setDraftLatLng([center.lat, center.lng]);
        openDrawer();
      }
    };
    window.addEventListener('wartracker:add-pin', onAddPin as EventListener);
    return () => window.removeEventListener('wartracker:add-pin', onAddPin as EventListener);
  }, [openDrawer]);

  useEffect(() => {
    if (pinDrawerOpen && showBrief) {
      onCloseBrief();
    }
  }, [pinDrawerOpen, showBrief, onCloseBrief]);

  useEffect(() => {
    // No mapRef guard: this only mutates a LayerGroup held in a ref, which is
    // valid whether or not it is attached to a map (MapBootstrap attaches it
    // independently). The old guard could bail before MapBootstrap mounted and,
    // because the effect only re-runs on [pins, ...], never retry.
    manualPinsLayer.current.clearLayers();
    pins.forEach((pin) => {
      if (legendFilters.length > 0 && !legendFilters.includes(pin.category)) return;
      const marker = L.marker([pin.lat, pin.lng], { icon: manualIcon(pin.category) });
      const isHoveredMismatch = hoveredLegendKey ? hoveredLegendKey !== pin.category : false;
      marker.setOpacity(isHoveredMismatch ? 0.2 : 1);

      const popupEl = document.createElement('div');
      popupEl.style.fontFamily = "'Space Grotesk', sans-serif";
      popupEl.style.minWidth = '240px';
      const safeTitle = escapeHtml(pin.title);
      const safeDescription = pin.description ? escapeHtml(pin.description) : '';
      popupEl.innerHTML = `
        <div style='margin-bottom:10px'>
          <div style='font-family:JetBrains Mono,monospace;font-size:9px;
            color:#00AAFF;letter-spacing:1px;margin-bottom:6px'>
            📍 ${escapeHtml(pin.category.toUpperCase())}
          </div>
          <p style='font-size:13px;font-weight:600;color:#F0F4F8;
            margin:0 0 4px;line-height:1.4'>${safeTitle}</p>
          ${pin.description ? `<p style='font-size:11px;color:#5E7A96;
            margin:0;font-style:italic'>${safeDescription}</p>` : ''}
        </div>
        <div style='display:flex;gap:6px;padding-top:8px;
          border-top:1px solid rgba(255,255,255,0.07)'>
          <button id='edit-pin-${pin.id}' style='
            flex:1;padding:5px;font-size:11px;cursor:pointer;
            background:rgba(0,170,255,0.1);border:1px solid rgba(0,170,255,0.3);
            border-radius:4px;color:#00AAFF;font-family:JetBrains Mono,monospace'>
            ✏ Duzenle
          </button>
          <button id='delete-pin-${pin.id}' style='
            flex:1;padding:5px;font-size:11px;cursor:pointer;
            background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);
            border-radius:4px;color:#FF3B3B;font-family:JetBrains Mono,monospace'>
            ✕ Sil
          </button>
        </div>
      `;

      // Listeners are attached once, here, to the element bindPopup owns.
      // Attaching them on every 'popupopen' with { once: true } accumulated a
      // new listener per open/close cycle (a `once` listener only detaches when
      // it fires), so clicking Sil after N cycles fired N delete requests.
      // The listener itself must return void, not a promise: addEventListener
      // ignores what a handler returns, so an async handler's rejection has
      // nowhere to go. showConfirmToast() is awaited inside, so wrapping the
      // whole thing keeps its failure from becoming an unhandled rejection.
      popupEl.querySelector(`#delete-pin-${pin.id}`)?.addEventListener('click', () => {
        void (async () => {
          const confirmed = await showConfirmToast('Bu pini silmek istediginden emin misin?');
          if (!confirmed) return;
          marker.closePopup();
          try {
            await useMapStore.getState().deletePin(pin.id);
          } catch {
            // Already removed; the socket pin:deleted event reconciles state.
          }
        })();
      });

      popupEl.querySelector(`#edit-pin-${pin.id}`)?.addEventListener('click', () => {
        marker.closePopup();
        useMapStore.getState().openEditDrawer(pin);
      });

      marker.bindPopup(popupEl, { minWidth: 240, closeButton: true, keepInView: true });

      marker.addTo(manualPinsLayer.current);
    });
  }, [pins, legendFilters, hoveredLegendKey]);

  useEffect(() => {
    // See the manual-pin effect above: no mapRef guard needed or wanted.
    const layer = newsPinsLayerRef.current;
    layer.clearLayers();
      newsPins.forEach((pin) => {
        if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;
        if (legendFilters.length > 0 && !legendFilters.includes(pin.category)) return;

      const crit = isCritical(pin.title);
      const isSaved = useBookmarkStore.getState().isBookmarked(pin.id);
      const watchMatches = useWatchlistStore.getState().matches(pin.title);
      const isWatched = watchMatches.length > 0;
      const diff = Date.now() - new Date(pin.pubDate).getTime();
      const mins = Math.floor(diff / 60000);
      const relTime = mins < 1 ? 'şimdi'
        : mins < 60 ? `${mins}dk`
          : mins < 1440 ? `${Math.floor(mins / 60)}sa`
            : `${Math.floor(mins / 1440)}g`;

        const marker = L.marker([pin.lat, pin.lng], {
          icon: createNewsPinIcon(pin),
          zIndexOffset: isSaved ? 500 : crit ? 2000 : isWatched ? 1500 : 0
        });
        const isHoveredMismatch = hoveredLegendKey ? hoveredLegendKey !== pin.category : false;
        marker.setOpacity(isHoveredMismatch ? 0.2 : 1);

      const safeSource = escapeHtml(pin.source.toUpperCase());
      const safeTitle = escapeHtml(pin.title);
      const safeSummary = pin.aiSummary ? escapeHtml(pin.aiSummary) : '';
      const safeLink = toSafeUrl(pin.link);

      marker.bindPopup(`
        <div style='font-family:Space Grotesk,sans-serif'>
          <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'>
            <span style='font-family:JetBrains Mono,monospace;font-size:10px;color:${crit ? '#FF4444' : '#00AAFF'};background:rgba(255,255,255,0.05);padding:2px 7px;border-radius:3px'>${safeSource}</span>
            <span style='font-family:JetBrains Mono,monospace;font-size:10px;color:#5E7A96'>${relTime}</span>
          </div>
          <p style='font-size:13px;font-weight:600;color:#F0F4F8;line-height:1.45;margin-bottom:10px'>${safeTitle}</p>
          ${pin.aiSummary ? `
            <div style='border-top:1px solid rgba(255,255,255,0.07);padding-top:8px;margin-top:4px;margin-bottom:8px'>
              <div style='font-family:JetBrains Mono,monospace;font-size:9px;color:#F5A623;letter-spacing:1px;margin-bottom:4px'>🤖 AI ÖZETİ</div>
              <p style='font-size:11px;color:#5E7A96;line-height:1.5'>${safeSummary}</p>
            </div>
          ` : ''}
          <div style='margin-bottom:8px;font-family:JetBrains Mono,monospace;font-size:10px;color:${pin.confidenceLabel === 'Yüksek' ? '#00D084' : pin.confidenceLabel === 'Orta' ? '#F5A623' : '#FF6B00'}'>
            Güvenilirlik: ${typeof pin.reliabilityScore === 'number' ? `%${pin.reliabilityScore}` : 'Yetersiz veri'}
          </div>
          <a href='${safeLink}' target='_blank' rel='noopener noreferrer' style='display:inline-block;font-size:11px;color:${crit ? '#FF4444' : '#00AAFF'};text-decoration:none;font-family:JetBrains Mono,monospace;letter-spacing:0.5px'>Haberi Aç ↗</a>
        </div>
      `, {
        maxWidth: 340,
        minWidth: 280,
        closeButton: true,
        autoPan: true,
        keepInView: true
      });

      layer.addLayer(marker);
    });
  }, [newsPins, bookmarkIds, legendFilters, hoveredLegendKey]);

  useEffect(() => {
    nuclearLayerRef.current.clearLayers();
    if (!showNuclear) return;

    NUCLEAR_SITES.forEach((site) => {
      const color = site.country === 'iran' ? '#A78BFA' : '#60A5FA';
      const icon = L.divIcon({
        html: `
          <div style='
            width:22px; height:22px;
            background:${color}22;
            border:1.5px solid ${color};
            border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            font-size:11px;
          '>☢</div>
        `,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const marker = L.marker([site.lat, site.lng], { icon, zIndexOffset: 800 });
      marker.bindPopup(
        `
        <div style='font-family:Space Grotesk,sans-serif;min-width:200px'>
          <div style='font-family:JetBrains Mono,monospace;font-size:9px;
            color:${color};letter-spacing:1px;margin-bottom:6px'>
            ☢ ${site.country.toUpperCase()} · ${site.type}
          </div>
          <p style='font-size:13px;font-weight:600;color:#F0F4F8;margin:0 0 6px'>
            ${site.name}
          </p>
          <p style='font-size:11px;color:#5E7A96;margin:0;font-style:italic'>
            ${site.note}
          </p>
        </div>
      `,
        { maxWidth: 280, closeButton: true, keepInView: true }
      );

      nuclearLayerRef.current.addLayer(marker);
    });
  }, [showNuclear]);

  useEffect(() => {
    samLayerRef.current.clearLayers();
    if (!showSam) return;

    SAM_SYSTEMS.forEach((sys) => {
      const color = sys.country === 'iran' ? '#F87171' : '#34D399';

      L.circle([sys.lat, sys.lng], {
        radius: sys.radiusKm * 1000,
        color,
        weight: 1,
        opacity: 0.6,
        fillColor: color,
        fillOpacity: 0.04,
        dashArray: '4 4'
      })
        .bindTooltip(sys.name, {
          permanent: false,
          direction: 'top',
          className: 'wt-tooltip'
        })
        .addTo(samLayerRef.current);

      L.circleMarker([sys.lat, sys.lng], {
        radius: 4,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 1
      }).addTo(samLayerRef.current);
    });
  }, [showSam]);

  return (
    <section className="panel" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <MapContainer
            center={mapCenter}
            zoom={zoom}
            zoomControl={false}
            attributionControl={false}
            style={{ width: '100%', height: '100%', cursor: drawActive || pinMode ? 'crosshair' : 'grab' }}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <MapBootstrap
              mapRef={mapRef}
              manualPinsLayer={manualPinsLayer}
              newsPinsLayerRef={newsPinsLayerRef}
              nuclearLayerRef={nuclearLayerRef}
              samLayerRef={samLayerRef}
              pinMode={pinMode}
              drawActive={drawActive}
              onPick={handlePick}
            />
            <DrawController drawLayerRef={drawLayerRef} pinMode={pinMode} />
            <CursorTracker onMove={setCoords} />
            <ViewportSync center={workspace.center} zoom={workspace.zoom} />
          </MapContainer>

        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 'var(--z-map-controls)',
            background: 'rgba(2,5,10,0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius)',
            padding: 3,
            display: 'inline-flex',
            gap: 2
          }}
        >
          {WORKSPACES.map((ws) => {
            const active = ws.id === activeWorkspace;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => setActiveWorkspace(ws.id)}
                onMouseEnter={(e) => {
                  if (active) return;
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                  if (active) return;
                  e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                  e.currentTarget.style.background = 'transparent';
                }}
                style={{
                  padding: '5px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  border: 'none',
                  background: active ? '#00AAFF' : 'transparent',
                  color: active ? '#000000' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  fontWeight: active ? 600 : 500,
                  transition: 'all 0.15s'
                }}
              >
                {ws.name}
              </button>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 'var(--z-map-controls)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            background: 'rgba(2,5,10,0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius)',
            padding: 4,
            overflow: 'hidden'
          }}
        >
          <button
            type="button"
            title="Pin Modu"
            onClick={() => setPinMode((v) => !v)}
            style={{
              width: 32,
              height: 32,
              background: pinMode ? 'var(--accent)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: pinMode ? '#000000' : 'rgba(255,255,255,0.4)',
              fontSize: 15,
              borderRadius: 'calc(var(--radius) - 2px)',
              transition: 'all 0.12s'
            }}
          >
            ◉
          </button>

          <button
            type="button"
            title="Cizim Araclari"
            onClick={toggleDraw}
            style={{
              width: 32,
              height: 32,
              background: drawActive ? 'var(--accent)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: drawActive ? '#000000' : 'rgba(255,255,255,0.4)',
              fontSize: 15,
              borderRadius: 'calc(var(--radius) - 2px)',
              transition: 'all 0.12s'
            }}
          >
            ✏
          </button>

          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

          <button
            type="button"
            onClick={() => toggleLayer('nuclear')}
            title="Nükleer Tesisler"
            style={{
              width: 32,
              height: 32,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              borderRadius: 'var(--radius-sm)',
              color: showNuclear ? '#A78BFA' : 'rgba(255,255,255,0.3)',
              background: showNuclear ? 'rgba(167,139,250,0.12)' : 'none',
              transition: 'all 0.12s'
            }}
          >
            ☢
          </button>

          <button
            type="button"
            onClick={() => toggleLayer('sam')}
            title="SAM Menzilleri"
            style={{
              width: 32,
              height: 32,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              borderRadius: 'var(--radius-sm)',
              color: showSam ? '#34D399' : 'rgba(255,255,255,0.3)',
              background: showSam ? 'rgba(52,211,153,0.12)' : 'none',
              transition: 'all 0.12s'
            }}
          >
            🎯
          </button>
        </div>

        <DrawToolbar />

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            zIndex: 'var(--z-map-controls)',
            background: 'rgba(2,5,10,0.7)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 9px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: 0.5
          }}
        >
          {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            zIndex: 'var(--z-map-controls)',
            background: 'rgba(2,5,10,0.7)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 9px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: 0.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5
          }}
        >
          <span style={{ color: 'var(--accent)' }}>◈</span>
          <span>{newsPins.length} haber</span>
        </div>

        <MapLegend
          selectedKeys={legendFilters}
          onToggle={toggleLegendFilter}
          onReset={clearLegendFilters}
          onHover={setHoveredLegendKey}
        />

        <PinDrawer draftLatLng={draftLatLng} setDraftLatLng={setDraftLatLng} setPinMode={setPinMode} />
        <AiBriefPanel
          open={showBrief}
          loading={briefLoading}
          brief={briefText}
          model={briefModel}
          generatedAt={briefGeneratedAt}
          onClose={onCloseBrief}
          onRefresh={onRefreshBrief}
        />
      </div>
    </section>
  );
}

export default MapPanel;

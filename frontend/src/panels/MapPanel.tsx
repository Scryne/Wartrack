import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, MapPin, PenLine, Radar, Radiation } from 'lucide-react';
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
import { BASEMAP } from '../lib/basemap';
import { formatRelativeTime } from '../lib/time';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { useMapStore } from '../stores/useMapStore';
import { useDrawStore } from '../stores/useDrawStore';
import { useLayerStore } from '../stores/useLayerStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import type { Pin } from '../types';
import type { NewsPin } from '../stores/useMapStore';
import { DrawController } from './mapPanel/DrawController';
import { CursorTracker, MapBootstrap, ViewportSync } from './mapPanel/helpers';
import { PIN_COLOR, WORKSPACES, createNewsPinIcon, escapeHtml, isCritical, manualIcon, toSafeUrl, tokenColor } from './mapPanel/mapUtils';

const PIN_CATEGORY_LABEL: Record<string, string> = {
  strike: 'Taarruz',
  movement: 'Hareket',
  nuclear: 'Nükleer',
  naval: 'Deniz',
  air: 'Hava',
  info: 'Bilgi'
};

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
  const heatmapLayerRef = useRef(L.layerGroup());
  const drawActive = useDrawStore((s) => s.active);
  const toggleDraw = useDrawStore((s) => s.toggle);
  const showNuclear = useLayerStore((s) => s.nuclear);
  const showSam = useLayerStore((s) => s.sam);
  const showHeatmap = useLayerStore((s) => s.heatmap);
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
      const marker = L.marker([pin.lat, pin.lng], { icon: manualIcon(pin.category), title: `İşaret: ${pin.title}` });
      const isHoveredMismatch = hoveredLegendKey ? hoveredLegendKey !== pin.category : false;
      marker.setOpacity(isHoveredMismatch ? 0.2 : 1);

      const popupEl = document.createElement('div');
      popupEl.className = 'wt-popup';
      const safeTitle = escapeHtml(pin.title);
      const safeDescription = pin.description ? escapeHtml(pin.description) : '';
      const pinColor = PIN_COLOR[pin.category] ?? PIN_COLOR.info;
      popupEl.innerHTML = `
        <div class='wt-popup-meta'>
          <span class='wt-dot' style='background:${pinColor}'></span>
          ${escapeHtml(PIN_CATEGORY_LABEL[pin.category] ?? pin.category)} · işaret
        </div>
        <p class='wt-popup-title'>${safeTitle}</p>
        ${pin.description ? `<p class='wt-popup-text'>${safeDescription}</p>` : ''}
        <div class='wt-popup-actions'>
          <button type='button' id='edit-pin-${pin.id}' class='wt-popup-button'>Düzenle</button>
          <button type='button' id='delete-pin-${pin.id}' class='wt-popup-button wt-popup-button-danger'>İşareti sil</button>
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
          const confirmed = await showConfirmToast('Bu işaret kalıcı olarak silinsin mi?');
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

    // The gazetteer resolves a story to a city's centre, so every Jerusalem
    // story lands on the same point and stacked markers hid how many there
    // were ("30 on the map", six visible). Same point, one marker with a count.
    const groups = new Map<string, NewsPin[]>();
    newsPins.forEach((pin) => {
      if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;
      if (legendFilters.length > 0 && !legendFilters.includes(pin.category)) return;
      const key = `${pin.lat.toFixed(3)},${pin.lng.toFixed(3)}`;
      const list = groups.get(key);
      if (list) list.push(pin);
      else groups.set(key, [pin]);
    });

    const popupRow = (pin: NewsPin) => {
      const crit = isCritical(pin.title);
      return `
        <li class='wt-popup-row'>
          <div class='wt-popup-meta'>
            <span class='wt-popup-source'${crit ? " data-critical='true'" : ''}>${escapeHtml(pin.source)}</span>
            <span class='wt-popup-time'>${formatRelativeTime(pin.pubDate)}</span>
          </div>
          <a href='${toSafeUrl(pin.link)}' target='_blank' rel='noopener noreferrer' class='wt-popup-row-title'>${escapeHtml(pin.title)}</a>
        </li>`;
    };

    groups.forEach((group) => {
      const [pin] = group;
      const anyCritical = group.some((p) => isCritical(p.title));
      const anySaved = group.some((p) => useBookmarkStore.getState().isBookmarked(p.id));
      const anyWatched = group.some((p) => useWatchlistStore.getState().matches(p.title).length > 0);
      const isHoveredMismatch = hoveredLegendKey ? !group.some((p) => p.category === hoveredLegendKey) : false;

      if (group.length > 1) {
        const tone = anyCritical ? 'var(--color-danger)' : anyWatched ? 'var(--color-warning)' : 'var(--color-chart-6)';
        const marker = L.marker([pin.lat, pin.lng], {
          icon: L.divIcon({
            html: `<span class='wt-marker-count' style='--marker-color:${tone}'>${group.length}</span>`,
            className: '',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          }),
          zIndexOffset: anyCritical ? 2000 : anyWatched ? 1500 : 1000,
          title: `${group.length} haber`
        });
        marker.setOpacity(isHoveredMismatch ? 0.2 : 1);
        const sorted = [...group].sort((a, b) => b.pubDate.localeCompare(a.pubDate));
        marker.bindPopup(
          `<div class='wt-popup'>
            <div class='wt-popup-meta'><span>${group.length} haber bu noktada</span></div>
            <ul class='wt-popup-list'>${sorted.slice(0, 8).map(popupRow).join('')}</ul>
            ${group.length > 8 ? `<p class='wt-popup-text'>ve ${group.length - 8} haber daha; tamamı sağdaki akışta.</p>` : ''}
          </div>`,
          { maxWidth: 360, minWidth: 300, closeButton: true, autoPan: true, keepInView: true }
        );
        layer.addLayer(marker);
        return;
      }

      const crit = isCritical(pin.title);
      const marker = L.marker([pin.lat, pin.lng], {
        icon: createNewsPinIcon(pin),
        zIndexOffset: anySaved ? 500 : crit ? 2000 : anyWatched ? 1500 : 0,
        title: pin.title
      });
      marker.setOpacity(isHoveredMismatch ? 0.2 : 1);

      const reliabilityTone =
        pin.confidenceLabel === 'Yüksek'
          ? 'var(--color-success)'
          : pin.confidenceLabel === 'Orta'
            ? 'var(--color-warning)'
            : 'var(--color-threat-4)';
      marker.bindPopup(`
        <div class='wt-popup'>
          <div class='wt-popup-meta'>
            <span class='wt-popup-source'${crit ? " data-critical='true'" : ''}>${escapeHtml(pin.source)}</span>
            <span class='wt-popup-time'>${formatRelativeTime(pin.pubDate)}</span>
          </div>
          <p class='wt-popup-title'>${escapeHtml(pin.title)}</p>
          ${pin.aiSummary ? `<p class='wt-popup-text wt-popup-summary'>${escapeHtml(pin.aiSummary)}</p>` : ''}
          <div class='wt-popup-footer'>
            <span style='color:${reliabilityTone}'>Güvenilirlik ${typeof pin.reliabilityScore === 'number' ? `%${pin.reliabilityScore}` : ': yetersiz veri'}</span>
            <a href='${toSafeUrl(pin.link)}' target='_blank' rel='noopener noreferrer' class='wt-popup-link'>Habere git ↗</a>
          </div>
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
      const color = site.country === 'iran' ? 'var(--color-chart-3)' : 'var(--color-chart-4)';
      const icon = L.divIcon({
        html: `<span class='wt-marker-hit'><span class='wt-marker wt-marker-site' style='--marker-size:18px;--marker-color:${color}'></span></span>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([site.lat, site.lng], { icon, zIndexOffset: 800, title: `Nükleer tesis: ${site.name}` });
      marker.bindPopup(
        `
        <div class='wt-popup'>
          <div class='wt-popup-meta'>
            <span class='wt-dot' style='background:${color}'></span>
            Nükleer tesis · ${escapeHtml(site.country === 'iran' ? 'İran' : 'İsrail')} · ${escapeHtml(site.type)}
          </div>
          <p class='wt-popup-title'>${escapeHtml(site.name)}</p>
          <p class='wt-popup-text'>${escapeHtml(site.note)}</p>
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
      const color = sys.country === 'iran' ? tokenColor('--color-chart-1') : tokenColor('--color-chart-5');

      L.circle([sys.lat, sys.lng], {
        radius: sys.radiusKm * 1000,
        color,
        weight: 1,
        opacity: 0.6,
        fillColor: color,
        fillOpacity: 0.04,
        dashArray: '4 4'
      })
        .bindTooltip(`${sys.name} (${sys.radiusKm} km)`, {
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

  useEffect(() => {
    heatmapLayerRef.current.clearLayers();
    if (!showHeatmap) return;

    newsPins.forEach((pin) => {
      if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;
      const isHighSev = isCritical(pin.title);
      const outerColor = isHighSev ? tokenColor('--color-threat-5') : tokenColor('--color-threat-3');
      const innerColor = isHighSev ? tokenColor('--color-threat-5') : tokenColor('--color-threat-4');

      L.circle([pin.lat, pin.lng], {
        radius: isHighSev ? 75000 : 40000,
        color: 'transparent',
        fillColor: outerColor,
        fillOpacity: 0.18,
        stroke: false
      }).addTo(heatmapLayerRef.current);

      L.circle([pin.lat, pin.lng], {
        radius: isHighSev ? 30000 : 18000,
        color: 'transparent',
        fillColor: innerColor,
        fillOpacity: 0.4,
        stroke: false
      }).addTo(heatmapLayerRef.current);
    });
  }, [showHeatmap, newsPins]);

  return (
    <section className="panel wt-map" aria-label="Harita">
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <MapContainer
            center={mapCenter}
            zoom={zoom}
            zoomControl={false}
            attributionControl={false}
            style={{ width: '100%', height: '100%', cursor: drawActive || pinMode ? 'crosshair' : 'grab' }}
          >
            <TileLayer url={BASEMAP.tileUrl} maxNativeZoom={BASEMAP.maxNativeZoom} />
            {BASEMAP.labelsUrl ? (
              <TileLayer url={BASEMAP.labelsUrl} maxNativeZoom={BASEMAP.maxNativeZoom} />
            ) : null}
            <MapBootstrap
              mapRef={mapRef}
              manualPinsLayer={manualPinsLayer}
              newsPinsLayerRef={newsPinsLayerRef}
              nuclearLayerRef={nuclearLayerRef}
              samLayerRef={samLayerRef}
              heatmapLayerRef={heatmapLayerRef}
              pinMode={pinMode}
              drawActive={drawActive}
              onPick={handlePick}
            />
            <DrawController drawLayerRef={drawLayerRef} pinMode={pinMode} />
            <CursorTracker onMove={setCoords} />
            <ViewportSync center={workspace.center} zoom={workspace.zoom} />
          </MapContainer>

        <div className="wt-map-control wt-map-theatres segment-container" role="tablist" aria-label="Harita bölgesi">
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              type="button"
              role="tab"
              aria-selected={ws.id === activeWorkspace}
              className={`segment-item${ws.id === activeWorkspace ? ' segment-item-active' : ''}`}
              onClick={() => setActiveWorkspace(ws.id)}
            >
              {ws.name}
            </button>
          ))}
        </div>

        <div className="wt-map-control wt-map-tools" role="toolbar" aria-label="Harita araçları" aria-orientation="vertical">
          <button
            type="button"
            className="wt-map-tool"
            aria-pressed={pinMode}
            aria-label="İşaret koy"
            title="İşaret koy: haritada bir noktaya tıklayın"
            onClick={() => setPinMode((v) => !v)}
          >
            <MapPin size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="wt-map-tool"
            aria-pressed={drawActive}
            aria-label="Çizim araçları"
            title="Çizim araçları"
            onClick={toggleDraw}
          >
            <PenLine size={16} strokeWidth={1.75} />
          </button>
          <span className="wt-map-tools-divider" aria-hidden="true" />
          <button
            type="button"
            className="wt-map-tool"
            aria-pressed={showNuclear}
            aria-label="Nükleer tesisler katmanı"
            title="Nükleer tesisler"
            onClick={() => toggleLayer('nuclear')}
          >
            <Radiation size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="wt-map-tool"
            aria-pressed={showSam}
            aria-label="Hava savunma menzilleri katmanı"
            title="Hava savunma (SAM) menzilleri"
            onClick={() => toggleLayer('sam')}
          >
            <Radar size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="wt-map-tool"
            aria-pressed={showHeatmap}
            aria-label="Olay yoğunluğu katmanı"
            title="Olay yoğunluğu (sıcak noktalar)"
            onClick={() => toggleLayer('heatmap')}
          >
            <Flame size={16} strokeWidth={1.75} />
          </button>
        </div>

        <DrawToolbar />

        <div className="wt-map-control wt-map-readout wt-map-readout-left">
          <span className="tabular-nums">
            {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
          </span>
          <span className="wt-map-attribution">{BASEMAP.attribution}</span>
        </div>

        <div className="wt-map-control wt-map-readout wt-map-readout-right">
          <span className="tabular-nums">{newsPins.length}</span> haber haritada
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

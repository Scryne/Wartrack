import { useEffect, type MutableRefObject } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";

export function CursorTracker({ onMove }: { onMove: (v: [number, number]) => void }) {
  useMapEvents({
    mousemove(e) {
      onMove([Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))]);
    }
  });
  return null;
}

export function ViewportSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.65 });
  }, [map, center, zoom]);
  return null;
}

export function MapBootstrap({
  mapRef,
  manualPinsLayer,
  newsPinsLayerRef,
  nuclearLayerRef,
  samLayerRef,
  heatmapLayerRef,
  pinMode,
  drawActive,
  onPick
}: {
  mapRef: MutableRefObject<L.Map | null>;
  manualPinsLayer: MutableRefObject<L.LayerGroup>;
  newsPinsLayerRef: MutableRefObject<L.LayerGroup>;
  nuclearLayerRef: MutableRefObject<L.LayerGroup>;
  samLayerRef: MutableRefObject<L.LayerGroup>;
  heatmapLayerRef?: MutableRefObject<L.LayerGroup>;
  pinMode: boolean;
  drawActive: boolean;
  onPick: (latlng: [number, number]) => void;
}) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    const newsLayer = newsPinsLayerRef.current;
    const manualLayer = manualPinsLayer.current;
    const nuclearLayer = nuclearLayerRef.current;
    const samLayer = samLayerRef.current;
    const heatmapLayer = heatmapLayerRef?.current;

    map.addLayer(newsLayer);
    map.addLayer(manualLayer);
    map.addLayer(nuclearLayer);
    map.addLayer(samLayer);
    if (heatmapLayer) map.addLayer(heatmapLayer);

    const clickHandler = (ev: L.LeafletMouseEvent) => {
      if (!pinMode || drawActive) return;
      onPick([ev.latlng.lat, ev.latlng.lng]);
    };
    map.on("click", clickHandler);
    return () => {
      map.off("click", clickHandler);
      map.removeLayer(newsLayer);
      map.removeLayer(manualLayer);
      map.removeLayer(nuclearLayer);
      map.removeLayer(samLayer);
      if (heatmapLayer) map.removeLayer(heatmapLayer);
    };
  }, [
    map,
    mapRef,
    manualPinsLayer,
    newsPinsLayerRef,
    nuclearLayerRef,
    samLayerRef,
    heatmapLayerRef,
    pinMode,
    drawActive,
    onPick
  ]);

  return null;
}

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import { useDrawStore } from "../../stores/useDrawStore";
import { makeShapeId } from "./mapUtils";

type LatLngPoint = [number, number];

export function DrawController({
  drawLayerRef,
  pinMode
}: {
  drawLayerRef: MutableRefObject<L.LayerGroup>;
  pinMode: boolean;
}) {
  const map = useMap();
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const color = useDrawStore((s) => s.color);
  const shapes = useDrawStore((s) => s.shapes);
  const addShape = useDrawStore((s) => s.addShape);
  const tempLayerRef = useRef(L.layerGroup());
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<LatLngPoint[]>([]);
  const startPointRef = useRef<LatLngPoint | null>(null);
  const circleCenterRef = useRef<LatLngPoint | null>(null);
  const rectangleCornerRef = useRef<LatLngPoint | null>(null);
  const previewLayerRef = useRef<L.Layer | null>(null);
  const startMarkerRef = useRef<L.Layer | null>(null);

  const clearPreview = useCallback(() => {
    if (previewLayerRef.current) {
      tempLayerRef.current.removeLayer(previewLayerRef.current);
      previewLayerRef.current = null;
    }
    if (startMarkerRef.current) {
      tempLayerRef.current.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }
  }, []);

  const resetTransient = useCallback(() => {
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    startPointRef.current = null;
    circleCenterRef.current = null;
    rectangleCornerRef.current = null;
    clearPreview();
  }, [clearPreview]);

  useEffect(() => {
    const drawLayer = drawLayerRef.current;
    const tempLayer = tempLayerRef.current;
    drawLayer.addTo(map);
    tempLayer.addTo(map);
    return () => {
      drawLayer.remove();
      tempLayer.remove();
    };
  }, [map, drawLayerRef]);

  useEffect(() => {
    drawLayerRef.current.clearLayers();
    shapes.forEach((shape) => {
      const style = {
        color: shape.color,
        weight: 2,
        opacity: 0.85,
        fillOpacity: 0.12,
        fillColor: shape.color
      };
      let layer: L.Layer | undefined;
      if (shape.tool === "pen" || shape.tool === "line") {
        layer = L.polyline(shape.points, {
          ...style,
          fill: false,
          weight: shape.tool === "pen" ? 2 : 2.5
        });
      } else if (shape.tool === "circle" && shape.radius) {
        layer = L.circle(shape.points[0], { ...style, radius: shape.radius });
      } else if (shape.tool === "rectangle") {
        layer = L.polygon(shape.points, style);
      }
      if (layer) {
        layer.on("contextmenu", () => {
          useDrawStore.getState().removeShape(shape.id);
        });
        layer.addTo(drawLayerRef.current);
      }
    });
  }, [shapes, drawLayerRef]);

  useEffect(() => {
    const container = map.getContainer();
    if (active) {
      map.dragging.disable();
      container.style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      container.style.cursor = pinMode ? "crosshair" : "grab";
      resetTransient();
    }

    return () => {
      map.dragging.enable();
      container.style.cursor = pinMode ? "crosshair" : "grab";
    };
  }, [map, active, pinMode, resetTransient]);

  useEffect(() => {
    if (!active) return;
    resetTransient();
  }, [tool, active, resetTransient]);

  useMapEvents({
    mousedown(e) {
      if (!active || tool !== "pen") return;
      isDrawingRef.current = true;
      const firstPoint: LatLngPoint = [e.latlng.lat, e.latlng.lng];
      currentPointsRef.current = [firstPoint];
      clearPreview();
    },
    mousemove(e) {
      if (!active) return;
      const point: LatLngPoint = [e.latlng.lat, e.latlng.lng];

      if (tool === "pen" && isDrawingRef.current) {
        currentPointsRef.current.push(point);
        clearPreview();
        previewLayerRef.current = L.polyline(currentPointsRef.current, {
          color,
          weight: 2,
          opacity: 0.9
        }).addTo(tempLayerRef.current);
        return;
      }

      if (tool === "line" && startPointRef.current) {
        clearPreview();
        previewLayerRef.current = L.polyline([startPointRef.current, point], {
          color,
          weight: 2.5,
          opacity: 0.9
        }).addTo(tempLayerRef.current);
        startMarkerRef.current = L.circleMarker(startPointRef.current, {
          radius: 3,
          color,
          fillColor: color,
          fillOpacity: 1,
          weight: 1
        }).addTo(tempLayerRef.current);
        return;
      }

      if (tool === "circle" && circleCenterRef.current) {
        clearPreview();
        const radius = map.distance(circleCenterRef.current, point);
        previewLayerRef.current = L.circle(circleCenterRef.current, {
          color,
          radius,
          weight: 2,
          opacity: 0.85,
          fillColor: color,
          fillOpacity: 0.12
        }).addTo(tempLayerRef.current);
        startMarkerRef.current = L.circleMarker(circleCenterRef.current, {
          radius: 3,
          color,
          fillColor: color,
          fillOpacity: 1,
          weight: 1
        }).addTo(tempLayerRef.current);
        return;
      }

      if (tool === "rectangle" && rectangleCornerRef.current) {
        clearPreview();
        previewLayerRef.current = L.rectangle(L.latLngBounds(rectangleCornerRef.current, point), {
          color,
          weight: 2,
          opacity: 0.85,
          fillColor: color,
          fillOpacity: 0.12
        }).addTo(tempLayerRef.current);
        startMarkerRef.current = L.circleMarker(rectangleCornerRef.current, {
          radius: 3,
          color,
          fillColor: color,
          fillOpacity: 1,
          weight: 1
        }).addTo(tempLayerRef.current);
      }
    },
    mouseup() {
      if (!active || tool !== "pen" || !isDrawingRef.current) return;
      isDrawingRef.current = false;
      if (currentPointsRef.current.length >= 2) {
        addShape({
          id: makeShapeId(),
          tool: "pen",
          color,
          points: [...currentPointsRef.current]
        });
      }
      currentPointsRef.current = [];
      clearPreview();
    },
    click(e) {
      if (!active) return;
      const point: LatLngPoint = [e.latlng.lat, e.latlng.lng];

      if (tool === "line") {
        if (!startPointRef.current) {
          startPointRef.current = point;
          clearPreview();
          startMarkerRef.current = L.circleMarker(point, {
            radius: 3,
            color,
            fillColor: color,
            fillOpacity: 1,
            weight: 1
          }).addTo(tempLayerRef.current);
          return;
        }

        addShape({
          id: makeShapeId(),
          tool: "line",
          color,
          points: [startPointRef.current, point]
        });
        startPointRef.current = null;
        clearPreview();
        return;
      }

      if (tool === "circle") {
        if (!circleCenterRef.current) {
          circleCenterRef.current = point;
          clearPreview();
          startMarkerRef.current = L.circleMarker(point, {
            radius: 3,
            color,
            fillColor: color,
            fillOpacity: 1,
            weight: 1
          }).addTo(tempLayerRef.current);
          return;
        }

        const radius = map.distance(circleCenterRef.current, point);
        if (radius > 0) {
          addShape({
            id: makeShapeId(),
            tool: "circle",
            color,
            points: [circleCenterRef.current],
            radius
          });
        }
        circleCenterRef.current = null;
        clearPreview();
        return;
      }

      if (tool === "rectangle") {
        if (!rectangleCornerRef.current) {
          rectangleCornerRef.current = point;
          clearPreview();
          startMarkerRef.current = L.circleMarker(point, {
            radius: 3,
            color,
            fillColor: color,
            fillOpacity: 1,
            weight: 1
          }).addTo(tempLayerRef.current);
          return;
        }

        const [lat1, lng1] = rectangleCornerRef.current;
        const [lat2, lng2] = point;
        addShape({
          id: makeShapeId(),
          tool: "rectangle",
          color,
          points: [
            [lat1, lng1],
            [lat1, lng2],
            [lat2, lng2],
            [lat2, lng1]
          ]
        });
        rectangleCornerRef.current = null;
        clearPreview();
      }
    }
  });

  return null;
}

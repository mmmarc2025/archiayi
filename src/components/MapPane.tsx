import L from "leaflet";
import { useEffect, useRef } from "react";
import type { Fix, Network, Place } from "../lib/types";

interface MapPaneProps {
  network: Network;
  fix: Fix | null;
  showConcepts: boolean;
  panToken: number;
  onSimulate: (place: Place) => void;
  onOpenAr: (place: Place) => void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] ?? char;
  });
}

function iconFor(place: Place, active: boolean): L.DivIcon {
  const dotClass =
    place.kind === "depot"
      ? "depot"
      : place.kind === "corridor-end"
        ? "end"
        : place.officialName
          ? "official"
          : "station";
  const label =
    place.kind === "station" ? `${place.code ?? ""} ${place.name}` : place.name;
  return L.divIcon({
    className: "station-div",
    html: `<div class="pin-wrap"><i class="pin-dot ${dotClass}${active ? " active" : ""}"></i><span class="pin-label">${escapeHtml(label.trim())}</span></div>`,
    iconSize: [168, 28],
    iconAnchor: [7, 14],
  });
}

export function MapPane({
  network,
  fix,
  showConcepts,
  panToken,
  onSimulate,
  onOpenAr,
}: MapPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const userRef = useRef<L.CircleMarker | null>(null);
  const accRef = useRef<L.Circle | null>(null);
  const fittedRef = useRef(false);
  const fixRef = useRef(fix);
  const handlersRef = useRef({ onSimulate, onOpenAr });
  useEffect(() => {
    fixRef.current = fix;
    handlersRef.current = { onSimulate, onOpenAr };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;
    const map = L.map(host, {
      zoomControl: false,
      attributionControl: true,
    }).setView([23.475, 120.39], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      userRef.current = null;
      accRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const bounds = L.latLngBounds([]);

    const ordered = [...network.routes].sort((a, b) => (a.group === "blue" ? 1 : 0) - (b.group === "blue" ? 1 : 0));
    for (const route of ordered) {
      if (route.group === "concept" && !showConcepts) continue;
      const latlngs = route.coords.map(([lon, lat]) => [lat, lon] as [number, number]);
      const line = L.polyline(latlngs, {
        color: route.color,
        weight: route.group === "blue" ? 6 : 3,
        opacity: route.group === "blue" ? 0.92 : 0.8,
        dashArray: route.dashed ? "8 8" : undefined,
      });
      line.bindPopup(
        `<div class="lrt-popup-body"><h3>${escapeHtml(route.name)}</h3><p>${escapeHtml(route.summary)}</p></div>`,
        { className: "lrt-popup" },
      );
      line.addTo(group);
      if (route.group === "blue") bounds.extend(line.getBounds());
    }

    for (const place of network.places) {
      if (place.kind === "corridor-end" && !showConcepts) continue;
      const active = fix?.placeId === place.id;
      const marker = L.marker([place.lat, place.lon], { icon: iconFor(place, active) });
      const kindLabel =
        place.kind === "depot" ? "機廠構想" : place.kind === "corridor-end" ? "走廊端點" : place.officialName ? "公開站名" : "推估站名";
      marker.bindPopup(
        `<h3>${escapeHtml(place.code ? `${place.code} ${place.name}` : place.name)}</h3>
         <p>${escapeHtml(kindLabel)}${place.subtitle ? ` · ${escapeHtml(place.subtitle)}` : ""}</p>
         <p>${escapeHtml(place.note)}</p>
         <div class="popup-actions">
           <button type="button" class="primary" data-act="sim">在這裡模擬</button>
           <button type="button" class="secondary" data-act="ar">用實境看</button>
         </div>`,
        { className: "lrt-popup", maxWidth: 280 },
      );
      marker.on("popupopen", (event) => {
        const root = event.popup.getElement();
        root?.querySelector<HTMLButtonElement>("[data-act=sim]")?.addEventListener("click", () => {
          handlersRef.current.onSimulate(place);
        });
        root?.querySelector<HTMLButtonElement>("[data-act=ar]")?.addEventListener("click", () => {
          handlersRef.current.onOpenAr(place);
        });
      });
      marker.addTo(group);
    }

    if (!fittedRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36] });
      fittedRef.current = true;
    }
  }, [network, showConcepts, fix?.placeId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!fix) {
      userRef.current?.remove();
      accRef.current?.remove();
      userRef.current = null;
      accRef.current = null;
      return;
    }
    const latlng = L.latLng(fix.lat, fix.lon);
    if (!userRef.current) {
      userRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillOpacity: 1,
      }).addTo(map);
    }
    userRef.current.setLatLng(latlng);
    userRef.current.setStyle({
      fillColor: fix.simulated ? "#d4533a" : "#1f5fbf",
    });
    if (!fix.simulated && fix.accuracy && fix.accuracy < 1500) {
      if (!accRef.current) {
        accRef.current = L.circle(latlng, {
          radius: fix.accuracy,
          color: "#1f5fbf",
          weight: 1,
          fillColor: "#1f5fbf",
          fillOpacity: 0.08,
        }).addTo(map);
      }
      accRef.current.setLatLng(latlng);
      accRef.current.setRadius(fix.accuracy);
    } else {
      accRef.current?.remove();
      accRef.current = null;
    }
  }, [fix]);

  useEffect(() => {
    const map = mapRef.current;
    const current = fixRef.current;
    if (!map || !current || panToken === 0) return;
    map.flyTo([current.lat, current.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [panToken]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

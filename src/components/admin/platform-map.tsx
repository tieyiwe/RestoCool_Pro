"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type MapPoint = { id: string; name: string; city: string | null; lat: number; lng: number; published: boolean; rc: string | null };

/**
 * Every located business on OpenStreetMap (free tiles, attribution kept). Green = published,
 * gold = draft. A click opens the business in the admin. Leaflet loads only on this page.
 */
export function PlatformMap({ points, labels }: { points: MapPoint[]; labels: { open: string; draft: string } }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([12.3, -1.6], 6); // Burkina Faso
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const bounds: [number, number][] = [];
      for (const p of points) {
        const color = p.published ? "#0f6b3e" : "#e9b530";
        const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.95 }).addTo(map);
        const a = document.createElement("a");
        a.href = `/admin/businesses/${p.id}`;
        a.textContent = `${p.name}${p.city ? ` · ${p.city}` : ""}${p.rc ? ` · ${p.rc}` : ""}${p.published ? "" : ` (${labels.draft})`}`;
        a.style.fontWeight = "700";
        marker.bindPopup(a);
        bounds.push([p.lat, p.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      else if (bounds.length === 1) map.setView(bounds[0]!, 14);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, labels]);
  return <div ref={el} className="h-[70vh] min-h-96 w-full overflow-hidden rounded-2xl border border-border" role="region" aria-label={labels.open} data-testid="admin-map" />;
}

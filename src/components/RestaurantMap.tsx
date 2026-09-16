"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapRestaurant = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  ward: string;
  cuisine: string;
  cuisineLabel: string;
  authenticity: string;
  authenticityLabel: string;
  rating: number;
  photo: string | null;
  mapsUrl: string;
};

type Props = {
  locale: string;
  restaurants: MapRestaurant[];
  cuisineOptions: { value: string; label: string }[];
  authenticityOptions: { value: string; label: string }[];
  copy: {
    allCuisines: string;
    allAuthenticity: string;
    minRating: string;
    count: string;
    empty: string;
    detail: string;
    openInMaps: string;
    reset: string;
    loading: string;
  };
};

// 正宗度对应的标记颜色，和站内 badge 的配色保持一致
const AUTHENTICITY_COLOR: Record<string, string> = {
  authentic: "#b4001e",
  adapted: "#e0a80c",
  japanese: "#8a8079",
  unknown: "#c4b8ab",
};

const TOKYO_CENTER: [number, number] = [139.7036, 35.6895];

export default function RestaurantMap({ locale, restaurants, cuisineOptions, authenticityOptions, copy }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [cuisine, setCuisine] = useState("");
  const [authenticity, setAuthenticity] = useState("");
  const [minRating, setMinRating] = useState(0);

  const filtered = useMemo(
    () =>
      restaurants.filter(
        (r) =>
          (!cuisine || r.cuisine === cuisine) &&
          (!authenticity || r.authenticity === authenticity) &&
          (!minRating || r.rating >= minRating)
      ),
    [restaurants, cuisine, authenticity, minRating]
  );

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filtered.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
        properties: { ...r },
      })),
    }),
    [filtered]
  );

  // 初始化地图。maplibre 体积不小，用动态 import 让它不进首屏 chunk。
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 用原生动态 import 从 public/ 加载，webpackIgnore 让 webpack 不要接管这行。
      // 被 webpack 打包后 maplibre 的 Web Worker 相对路径会失效（worker 请求落到
      // 404 页面，拿回 HTML，地图永远卡在 loading）。三个 .mjs 挨在 /public 下时
      // import.meta.url 的相对解析天然正确。
      const maplibre = (await import(
        /* webpackIgnore: true */
        // @ts-expect-error 运行时才存在的 URL（由 scripts/copy-maplibre.mjs 放进 public/），TS 无法静态解析
        "/maplibre-gl.mjs"
      )) as typeof import("maplibre-gl");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        // OpenFreeMap：免费、无需 API key、无调用上限的 OpenStreetMap 矢量瓦片。
        // 刻意不用 Google Maps JavaScript API —— 那个按加载次数计费。
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: TOKYO_CENTER,
        zoom: 10,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibre.GeolocateControl({ trackUserLocation: false }), "top-right");

      map.on("load", () => {
        if (cancelled) return;
        map.addSource("restaurants", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 13,
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "restaurants",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#b4001e",
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff8f0",
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "restaurants",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 13,
            "text-font": ["Noto Sans Bold"],
          },
          paint: { "text-color": "#fff8f0" },
        });

        map.addLayer({
          id: "points",
          type: "circle",
          source: "restaurants",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "authenticity"],
              "authentic", AUTHENTICITY_COLOR.authentic,
              "adapted", AUTHENTICITY_COLOR.adapted,
              "japanese", AUTHENTICITY_COLOR.japanese,
              AUTHENTICITY_COLOR.unknown,
            ],
            "circle-radius": 8,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#fff8f0",
          },
        });

        // 点聚合：点一下展开
        map.on("click", "clusters", (e: MapMouseEvent) => {
          const feature = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const clusterId = feature?.properties?.cluster_id;
          if (clusterId === undefined) return;
          const source = map.getSource("restaurants") as GeoJSONSource;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom,
            });
          });
        });

        map.on("click", "points", (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const p = feature.properties as unknown as MapRestaurant;
          const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

          const photo = p.photo
            ? `<img src="${p.photo}" alt="" loading="lazy" style="width:100%;height:110px;object-fit:cover;border-radius:8px 8px 0 0" />`
            : "";

          new maplibre.Popup({ offset: 14, maxWidth: "260px", closeButton: true })
            .setLngLat(coords)
            .setHTML(
              `<div style="width:236px;font-family:inherit">
                 ${photo}
                 <div style="padding:10px 12px 12px">
                   <div style="font-weight:700;font-size:14px;line-height:1.35;color:#2e211b">${p.name}</div>
                   <div style="margin-top:6px;display:flex;gap:8px;align-items:center;font-size:11px;color:#8a8079">
                     <span style="font-weight:700;color:#2e211b">★ ${Number(p.rating).toFixed(1)}</span>
                     <span>${p.cuisineLabel}</span>
                     <span>${p.ward}</span>
                   </div>
                   <div style="margin-top:4px;font-size:11px;color:#8a8079">${p.authenticityLabel}</div>
                   <div style="margin-top:10px;display:flex;gap:12px;font-size:12px;font-weight:600">
                     <a href="/${locale}/restaurants/${p.id}" style="color:#b4001e;text-decoration:none">${copy.detail}</a>
                     <a href="${p.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#524740;text-decoration:none">${copy.openInMaps}</a>
                   </div>
                 </div>
               </div>`
            )
            .addTo(map);
        });

        for (const layer of ["clusters", "points"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }

        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [locale, copy.detail, copy.openInMaps]);

  // 筛选变化时只换数据，不重建地图
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("restaurants") as GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson, ready]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "border-vermilion-700 bg-vermilion-700 text-white"
        : "border-warm-200 bg-white text-ink-700 hover:border-vermilion-500"
    }`;

  const hasFilter = Boolean(cuisine || authenticity || minRating);

  return (
    <div className="flex flex-col">
      <div className="border-b border-warm-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="scroll-row !gap-2 !pb-1">
            <button type="button" onClick={() => setCuisine("")} className={chip(!cuisine)}>
              {copy.allCuisines}
            </button>
            {cuisineOptions.map((o) => (
              <button key={o.value} type="button" onClick={() => setCuisine(o.value)} className={chip(cuisine === o.value)}>
                {o.label}
              </button>
            ))}
          </div>

          <div className="scroll-row !gap-2 !pb-1">
            <button type="button" onClick={() => setAuthenticity("")} className={chip(!authenticity)}>
              {copy.allAuthenticity}
            </button>
            {authenticityOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAuthenticity(o.value)}
                className={chip(authenticity === o.value)}
              >
                {o.label}
              </button>
            ))}
            {[4.5, 4].map((r) => (
              <button key={r} type="button" onClick={() => setMinRating(minRating === r ? 0 : r)} className={chip(minRating === r)}>
                {copy.minRating} {r}+
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span className="font-semibold text-ink-700">
              {filtered.length} {copy.count}
            </span>
            {hasFilter && (
              <button
                type="button"
                onClick={() => {
                  setCuisine("");
                  setAuthenticity("");
                  setMinRating(0);
                }}
                className="font-semibold text-vermilion-700 hover:underline"
              >
                {copy.reset}
              </button>
            )}
            {filtered.length === 0 && <span>{copy.empty}</span>}
          </div>
        </div>
      </div>

      <div className="relative h-[calc(100vh-13rem)] min-h-[420px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-warm-50 text-sm text-ink-400">
            {copy.loading}
          </div>
        )}
      </div>
    </div>
  );
}

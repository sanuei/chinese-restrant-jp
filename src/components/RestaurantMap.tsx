"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    listTitle: string;
    listHint: string;
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

type MapLibreModule = typeof import("maplibre-gl");

export default function RestaurantMap({ locale, restaurants, cuisineOptions, authenticityOptions, copy }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // 地图模块本身也存一份 ref：侧栏列表点一下要弹同一个弹窗，拿不到这个就造不出 Popup
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const popupRef = useRef<{ remove: () => void } | null>(null);
  const [cuisine, setCuisine] = useState("");
  const [authenticity, setAuthenticity] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 弹窗文案走 ref：避免把对象属性写进 effect 依赖，effect 重跑会让地图重建、ready 丢失
  const copyRef = useRef(copy);
  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

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

  const geojsonSource = useMemo(
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
  const geojson = geojsonSource;
  // load 回调里要用到最新数据，但不能把 geojson 写进 effect 依赖（会重建地图）
  const geojsonRef = useRef(geojson);

  /** 打开某家店的弹窗。地图上点标记、侧栏列表点条目，走的都是这一个函数。 */
  const openPopup = useCallback((restaurant: MapRestaurant) => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;

    // 只留一个弹窗：连点几家店时不希望屏幕上叠一排
    popupRef.current?.remove();

    const photo = restaurant.photo
      ? `<img src="${restaurant.photo}" alt="" loading="lazy" style="width:100%;height:110px;object-fit:cover;border-radius:8px 8px 0 0" />`
      : "";

    popupRef.current = new maplibre.Popup({ offset: 14, maxWidth: "260px", closeButton: true })
      .setLngLat([restaurant.lng, restaurant.lat])
      .setHTML(
        `<div style="width:236px;font-family:inherit">
           ${photo}
           <div style="padding:10px 12px 12px">
             <div style="font-weight:700;font-size:14px;line-height:1.35;color:#2e211b">${restaurant.name}</div>
             <div style="margin-top:6px;display:flex;gap:8px;align-items:center;font-size:11px;color:#8a8079">
               <span style="font-weight:700;color:#2e211b">★ ${Number(restaurant.rating).toFixed(1)}</span>
               <span>${restaurant.cuisineLabel}</span>
               <span>${restaurant.ward}</span>
             </div>
             <div style="margin-top:4px;font-size:11px;color:#8a8079">${restaurant.authenticityLabel}</div>
             <div style="margin-top:10px;display:flex;gap:12px;font-size:12px;font-weight:600">
               <a href="/${locale}/restaurants/${restaurant.id}" style="color:#b4001e;text-decoration:none">${copyRef.current.detail}</a>
               <a href="${restaurant.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#524740;text-decoration:none">${copyRef.current.openInMaps}</a>
             </div>
           </div>
         </div>`
      )
      .addTo(map);
  }, [locale]);

  /** 侧栏点条目：地图飞过去 + 打开弹窗 */
  const focusRestaurant = useCallback(
    (restaurant: MapRestaurant) => {
      setActiveId(restaurant.id);
      const map = mapRef.current;
      if (map) {
        map.flyTo({
          center: [restaurant.lng, restaurant.lat],
          zoom: Math.max(map.getZoom(), 14),
          duration: 700,
        });
      }
      openPopup(restaurant);
    },
    [openPopup]
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
      maplibreRef.current = maplibre;

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
          setActiveId(p.id);
          openPopup(p);
        });

        for (const layer of ["clusters", "points"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }

        // 初始数据在这里直接灌
        (map.getSource("restaurants") as GeoJSONSource | undefined)?.setData(geojsonRef.current);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, [openPopup]);

  // 筛选变化时只换数据，不重建地图
  useEffect(() => {
    geojsonRef.current = geojson;
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("restaurants") as GeoJSONSource | undefined)?.setData(geojson);
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [geojson]);

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

      {/* 左列表 + 右地图。手机上顺序反过来：先地图后列表（列表可以有几百条，别把人埋在列表里）。
          grid-cols 必须显式写 minmax(0,1fr)：默认的 auto 列会被「最长的店名」撑宽（truncate 只管
          裁切，不减少 max-content 宽度），手机上于是整页横向溢出。 */}
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="order-2 min-w-0 border-warm-200 bg-white lg:order-1 lg:h-[calc(100vh-13rem)] lg:min-h-[420px] lg:overflow-y-auto lg:border-r">
          <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-warm-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm">
            <span className="font-serif text-sm font-black text-ink-900">{copy.listTitle}</span>
            <span className="text-xs text-ink-400">
              {filtered.length} {copy.count}
            </span>
            <span className="ml-auto hidden text-[11px] text-ink-400 lg:inline">{copy.listHint}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-400">{copy.empty}</div>
          ) : (
            <ul>
              {filtered.map((r) => {
                const active = r.id === activeId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => focusRestaurant(r)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 border-b border-warm-100 px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-vermilion-50" : "hover:bg-warm-50"
                      }`}
                    >
                      {r.photo ? (
                        // 图片走 /api/photo（R2 缓存），不走 next/image
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.photo}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-md bg-warm-100 object-cover"
                        />
                      ) : (
                        <span className="h-14 w-14 shrink-0 rounded-md bg-warm-100" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold leading-snug text-ink-900">{r.name}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-400">
                          <span className="font-bold text-ink-700">★ {r.rating.toFixed(1)}</span>
                          <span className={`cuisine-tag cuisine-${r.cuisine}`}>{r.cuisineLabel}</span>
                          <span className="truncate">{r.ward}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-400">{r.authenticityLabel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="relative order-1 h-[70vh] min-h-[360px] w-full min-w-0 bg-warm-50 lg:order-2 lg:h-[calc(100vh-13rem)] lg:min-h-[420px]">
          {/* 加载提示垫在地图底下，地图画出来自然就盖住了。
              刻意不用 ready 状态去控制显隐 —— 之前靠 load/idle 事件置状态，
              事件没按预期触发时遮罩会永远盖住一张其实已经渲染好的地图。
              这样写没有状态可卡。 */}
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-400">
            {copy.loading}
          </div>
          {/* 不能用 absolute inset-0：maplibre 会给这个元素加 .maplibregl-map，
              它的 CSS 是 position:relative，会盖掉 absolute，导致 inset-0 失效、高度塌成 0 */}
          <div ref={containerRef} className="relative h-full w-full" />
        </div>
      </div>
    </div>
  );
}

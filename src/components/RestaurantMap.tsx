"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as MapLibreMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrainFront,
  X,
} from "lucide-react";

export type MapRestaurant = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  ward: string;
  stationLabel: string | null;
  stationKeys: string[];
  cuisine: string;
  cuisineLabel: string;
  dishType: string;
  dishTypeLabel: string;
  authenticity: string;
  authenticityLabel: string;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4 | null;
  summarySnippet: string | null;
  isTempClosed: boolean;
  photo: string | null;
  mapsUrl: string;
  searchText: string;
};

export type MapStationPreset = {
  key: string;
  label: string;
  count: number;
  lng: number;
  lat: number;
  zoom: number;
};

type InitialFilters = {
  q: string;
  cuisine: string;
  dishType: string;
  authenticity: string;
  station: string;
  minRating: number;
};

type Props = {
  locale: string;
  restaurants: MapRestaurant[];
  cuisineOptions: { value: string; label: string }[];
  dishTypeOptions: { value: string; label: string }[];
  authenticityOptions: { value: string; label: string }[];
  stationPresets: MapStationPreset[];
  initialFilters: InitialFilters;
};

type MapBoundsBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type SortKey = "rating" | "reviews" | "distance";
type BaseStyleKey = "liberty" | "positron";

const BASE_STYLES: Record<BaseStyleKey, string> = {
  liberty: "https://tiles.openfreemap.org/styles/liberty",
  positron: "https://tiles.openfreemap.org/styles/positron",
};

// 正宗度对应的地图点位颜色（与全站暗黑曜石印章视觉一致）
const AUTHENTICITY_COLOR: Record<string, string> = {
  authentic: "#e65a35",
  adapted: "#e5ab3c",
  japanese: "#4a90d9",
  unknown: "#8c857d",
};

const TOKYO_CENTER: [number, number] = [139.7236, 35.6938];

type MapLibreModule = typeof import("maplibre-gl");

/** 计算两点之间的球面直线距离（单位：米） */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number, isZh: boolean): string {
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10}m`;
  }
  const km = meters / 1000;
  return km < 10
    ? `${km.toFixed(1)}km`
    : isZh
      ? `${Math.round(km)}km`
      : `${Math.round(km)}km`;
}

function formatPrice(level: 1 | 2 | 3 | 4 | null): string | null {
  if (!level) return null;
  return "¥".repeat(level);
}

function readBounds(map: MapLibreMap): MapBoundsBox {
  const b = map.getBounds();
  return {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth(),
  };
}

function isInBounds(r: MapRestaurant, b: MapBoundsBox): boolean {
  return r.lng >= b.west && r.lng <= b.east && r.lat >= b.south && r.lat <= b.north;
}

export default function RestaurantMap({
  locale,
  restaurants,
  cuisineOptions,
  dishTypeOptions,
  authenticityOptions,
  stationPresets,
  initialFilters,
}: Props) {
  const isZh = locale === "zh";

  const copy = useMemo(
    () => ({
      searchPlaceholder: isZh ? "搜索店名、车站、菜系、火锅…" : "店名・駅名・ジャンル・火鍋で検索…",
      filters: isZh ? "筛选" : "絞り込み",
      all: isZh ? "全部" : "すべて",
      cuisineTitle: isZh ? "菜系风味" : "料理ジャンル",
      dishTitle: isZh ? "品类业态" : "業態・カテゴリー",
      authTitle: isZh ? "正宗度认证" : "ガチ度認定",
      ratingTitle: isZh ? "最低评分" : "最低評価",
      hotAreas: isZh ? "热门商圈" : "人気エリア",
      countUnit: isZh ? "家" : "件",
      resetAll: isZh ? "清除全部" : "リセット",
      emptyTitle: isZh ? "当前条件下没有找到餐厅" : "条件に合う店舗が見つかりません",
      emptyHint: isZh ? "试试放宽筛选条件，或点击清除重新探索全图" : "条件を緩めるか、リセットして全体を表示してください",
      loading: isZh ? "正在加载东京中餐地图…" : "マップを読み込み中…",
      detail: isZh ? "查看详情" : "詳細を見る",
      openInMaps: isZh ? "导航" : "経路案内",
      sortRating: isZh ? "口碑优先" : "評価順",
      sortReviews: isZh ? "热度优先" : "レビュー順",
      sortDistance: isZh ? "离我最近" : "近い順",
      searchThisArea: isZh ? "在此区域筛选" : "このエリアで絞り込む",
      areaLocked: isZh ? "仅看当前地图视野" : "表示中のエリア内のみ",
      locateMe: isZh ? "定位附近" : "現在地",
      locating: isZh ? "定位中…" : "取得中…",
      locateDenied: isZh ? "未能获取位置，请检查浏览器定位权限" : "現在地を取得できませんでした。位置情報設定をご確認ください",
      fitAll: isZh ? "全览" : "全体表示",
      zoomIn: isZh ? "放大地图" : "拡大",
      zoomOut: isZh ? "缩小地图" : "縮小",
      styleLiberty: isZh ? "详图" : "標準",
      stylePositron: isZh ? "素图" : "シンプル",
      viewList: isZh ? "查看列表" : "リスト表示",
      viewMap: isZh ? "返回地图" : "地図に戻る",
      collapseSidebar: isZh ? "收起列表" : "リストを閉じる",
      expandSidebar: isZh ? "展开列表" : "リストを開く",
      tempClosed: isZh ? "暂停营业" : "一時休業",
      reviewsUnit: isZh ? "条评" : "件",
      prevShop: isZh ? "上一家" : "前へ",
      nextShop: isZh ? "下一家" : "次へ",
      legendAuthentic: isZh ? "正宗中华" : "ガチ中華",
      legendAdapted: isZh ? "改良中华" : "アレンジ",
      legendJapanese: isZh ? "日式中华" : "日式中華",
      fromMe: isZh ? "距你" : "現在地から",
      applyFilters: isZh ? "查看结果" : "結果を表示",
      clearAreaLock: isZh ? "取消视野限制" : "エリア制限を解除",
    }),
    [isZh]
  );

  // 地图实例引用
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isProgrammaticMoveRef = useRef(false);

  // 筛选状态
  const [query, setQuery] = useState(initialFilters.q);
  const [cuisine, setCuisine] = useState(initialFilters.cuisine);
  const [dishType, setDishType] = useState(initialFilters.dishType);
  const [authenticity, setAuthenticity] = useState(initialFilters.authenticity);
  const [station, setStation] = useState(initialFilters.station);
  const [minRating, setMinRating] = useState(initialFilters.minRating);
  const [sortBy, setSortBy] = useState<SortKey>("rating");

  // 视野联动状态
  const [mapBounds, setMapBounds] = useState<MapBoundsBox | null>(null);
  const [boundsOnly, setBoundsOnly] = useState(false);
  const [showAreaPrompt, setShowAreaPrompt] = useState(false);

  // 界面交互状态
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [baseStyle, setBaseStyle] = useState<BaseStyleKey>("liberty");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 定位状态
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // 按 ID 快速索引门店
  const restaurantById = useMemo(() => {
    const map = new Map<string, MapRestaurant>();
    for (const r of restaurants) map.set(r.id, r);
    return map;
  }, [restaurants]);

  // 1. 先应用属性与关键词筛选（用于地图点位展示与视野内计数）
  const attributeFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (cuisine && r.cuisine !== cuisine) return false;
      if (dishType && r.dishType !== dishType) return false;
      if (authenticity && r.authenticity !== authenticity) return false;
      if (station && !r.stationKeys.includes(station)) return false;
      if (minRating && r.rating < minRating) return false;
      if (q && !r.searchText.includes(q)) return false;
      return true;
    });
  }, [restaurants, cuisine, dishType, authenticity, station, minRating, query]);

  // 当前地图视野内符合条件的数量
  const inBoundsCount = useMemo(() => {
    if (!mapBounds) return attributeFiltered.length;
    let count = 0;
    for (const r of attributeFiltered) {
      if (isInBounds(r, mapBounds)) count += 1;
    }
    return count;
  }, [attributeFiltered, mapBounds]);

  // 2. 再叠加视野过滤 + 距离计算 + 排序（用于左侧/移动端列表及上一家下一家切换）
  const displayList = useMemo(() => {
    const base =
      boundsOnly && mapBounds
        ? attributeFiltered.filter((r) => isInBounds(r, mapBounds))
        : attributeFiltered;

    const withDist = base.map((r) => ({
      restaurant: r,
      distance: userLocation ? distanceMeters(userLocation.lat, userLocation.lng, r.lat, r.lng) : null,
    }));

    withDist.sort((a, b) => {
      if (sortBy === "distance" && a.distance !== null && b.distance !== null) {
        return a.distance - b.distance;
      }
      if (sortBy === "reviews") {
        if (b.restaurant.reviewCount !== a.restaurant.reviewCount) {
          return b.restaurant.reviewCount - a.restaurant.reviewCount;
        }
        return b.restaurant.rating - a.restaurant.rating;
      }
      // 默认口碑优先
      if (b.restaurant.rating !== a.restaurant.rating) {
        return b.restaurant.rating - a.restaurant.rating;
      }
      return b.restaurant.reviewCount - a.restaurant.reviewCount;
    });

    return withDist;
  }, [attributeFiltered, boundsOnly, mapBounds, userLocation, sortBy]);

  // 统计各品类实际门店数，避免展示 0 家分类干扰选择
  const dishCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of restaurants) map.set(r.dishType, (map.get(r.dishType) || 0) + 1);
    return map;
  }, [restaurants]);

  const cuisineCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of restaurants) map.set(r.cuisine, (map.get(r.cuisine) || 0) + 1);
    return map;
  }, [restaurants]);

  // 仅当选中的门店仍在当前属性筛选集合中时展示浮卡
  const selectedRestaurant = useMemo(() => {
    if (!selectedId) return null;
    return attributeFiltered.find((r) => r.id === selectedId) || null;
  }, [selectedId, attributeFiltered]);

  const selectedIndex = useMemo(() => {
    if (!selectedRestaurant) return -1;
    return displayList.findIndex((item) => item.restaurant.id === selectedRestaurant.id);
  }, [displayList, selectedRestaurant]);

  const selectedDistance = useMemo(() => {
    if (!selectedRestaurant || !userLocation) return null;
    return distanceMeters(userLocation.lat, userLocation.lng, selectedRestaurant.lat, selectedRestaurant.lng);
  }, [selectedRestaurant, userLocation]);

  // 活跃筛选数量（不含关键词）
  const activeFilterCount =
    (cuisine ? 1 : 0) +
    (dishType ? 1 : 0) +
    (authenticity ? 1 : 0) +
    (station ? 1 : 0) +
    (minRating ? 1 : 0);

  const hasAnyFilter = Boolean(query.trim() || activeFilterCount > 0 || boundsOnly);

  // GeoJSON 数据（地图主图层）
  const mainGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: attributeFiltered.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
        properties: {
          id: r.id,
          name: r.name,
          rating: r.rating,
          ratingLabel: `★${r.rating.toFixed(1)} ${r.name}`,
          authenticity: r.authenticity,
        },
      })),
    }),
    [attributeFiltered]
  );

  // 高亮图层（悬停 / 选中）独立 GeoJSON，避免每次 hover 重算全量点聚类
  const highlightGeoJson = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    if (hoveredId && hoveredId !== selectedId) {
      const r = restaurantById.get(hoveredId);
      if (r) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.lng, r.lat] },
          properties: {
            id: r.id,
            state: "hover",
            authenticity: r.authenticity,
            name: r.name,
            ratingLabel: `★${r.rating.toFixed(1)} ${r.name}`,
          },
        });
      }
    }
    if (selectedRestaurant) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [selectedRestaurant.lng, selectedRestaurant.lat] },
        properties: {
          id: selectedRestaurant.id,
          state: "selected",
          authenticity: selectedRestaurant.authenticity,
          name: selectedRestaurant.name,
          ratingLabel: `★${selectedRestaurant.rating.toFixed(1)} ${selectedRestaurant.name}`,
        },
      });
    }
    return { type: "FeatureCollection" as const, features };
  }, [hoveredId, selectedId, selectedRestaurant, restaurantById]);

  const userGeoJson = useMemo(() => {
    if (!userLocation) {
      return { type: "FeatureCollection" as const, features: [] };
    }
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [userLocation.lng, userLocation.lat] },
          properties: {},
        },
      ],
    };
  }, [userLocation]);

  // Ref 镜像，保证地图异步加载/切换底图时随时能读取最新 GeoJSON
  const mainGeoJsonRef = useRef(mainGeoJson);
  const highlightGeoJsonRef = useRef(highlightGeoJson);
  const userGeoJsonRef = useRef(userGeoJson);
  useEffect(() => {
    mainGeoJsonRef.current = mainGeoJson;
  }, [mainGeoJson]);
  useEffect(() => {
    highlightGeoJsonRef.current = highlightGeoJson;
  }, [highlightGeoJson]);
  useEffect(() => {
    userGeoJsonRef.current = userGeoJson;
  }, [userGeoJson]);

  /** 幂等挂载/重建地图数据图层（首次 load 与切换底图 style.load 共用） */
  const syncMapLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource("restaurants")) {
      map.addSource("restaurants", {
        type: "geojson",
        data: mainGeoJsonRef.current,
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 13,
      });
    }

    if (!map.getLayer("clusters")) {
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "restaurants",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#e65a35",
            10,
            "#c93821",
            30,
            "#9c1d15",
          ],
          "circle-opacity": 0.92,
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 22, 30, 27],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#f6d58b",
        },
      });
    }

    if (!map.getLayer("cluster-count")) {
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "restaurants",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Noto Sans Bold"],
        },
        paint: { "text-color": "#fffaf2" },
      });
    }

    if (!map.getLayer("points")) {
      map.addLayer({
        id: "points",
        type: "circle",
        source: "restaurants",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "authenticity"],
            "authentic",
            AUTHENTICITY_COLOR.authentic,
            "adapted",
            AUTHENTICITY_COLOR.adapted,
            "japanese",
            AUTHENTICITY_COLOR.japanese,
            AUTHENTICITY_COLOR.unknown,
          ],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6.5, 14, 8.5, 16, 10],
          "circle-stroke-width": 2.2,
          "circle-stroke-color": "#fffaf2",
        },
      });
    }

    // 放大到街区层级自动浮现评分与店名标签，减少盲点试错
    if (!map.getLayer("point-labels")) {
      map.addLayer({
        id: "point-labels",
        type: "symbol",
        source: "restaurants",
        minzoom: 13.6,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "ratingLabel"],
          "text-size": 11,
          "text-font": ["Noto Sans Bold"],
          "text-offset": [0, 1.35],
          "text-anchor": "top",
          "text-max-width": 11,
          "text-optional": true,
        },
        paint: {
          "text-color": "#1a1715",
          "text-halo-color": "rgba(255, 252, 245, 0.96)",
          "text-halo-width": 1.8,
        },
      });
    }

    // 用户定位蓝点
    if (!map.getSource("user-location")) {
      map.addSource("user-location", {
        type: "geojson",
        data: userGeoJsonRef.current,
      });
    }

    if (!map.getLayer("user-location-halo")) {
      map.addLayer({
        id: "user-location-halo",
        type: "circle",
        source: "user-location",
        paint: {
          "circle-radius": 18,
          "circle-color": "#3b82f6",
          "circle-opacity": 0.22,
        },
      });
    }

    if (!map.getLayer("user-location-dot")) {
      map.addLayer({
        id: "user-location-dot",
        type: "circle",
        source: "user-location",
        paint: {
          "circle-radius": 7,
          "circle-color": "#2563eb",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    // 悬停与选中高亮层，永远置顶在最上方
    if (!map.getSource("highlight-restaurant")) {
      map.addSource("highlight-restaurant", {
        type: "geojson",
        data: highlightGeoJsonRef.current,
      });
    }

    if (!map.getLayer("highlight-halo")) {
      map.addLayer({
        id: "highlight-halo",
        type: "circle",
        source: "highlight-restaurant",
        paint: {
          "circle-radius": ["match", ["get", "state"], "selected", 22, 16],
          "circle-color": ["match", ["get", "state"], "selected", "#e65a35", "#e5ab3c"],
          "circle-opacity": ["match", ["get", "state"], "selected", 0.3, 0.28],
        },
      });
    }

    if (!map.getLayer("highlight-dot")) {
      map.addLayer({
        id: "highlight-dot",
        type: "circle",
        source: "highlight-restaurant",
        paint: {
          "circle-radius": ["match", ["get", "state"], "selected", 11.5, 10],
          "circle-color": [
            "match",
            ["get", "authenticity"],
            "authentic",
            AUTHENTICITY_COLOR.authentic,
            "adapted",
            AUTHENTICITY_COLOR.adapted,
            "japanese",
            AUTHENTICITY_COLOR.japanese,
            AUTHENTICITY_COLOR.unknown,
          ],
          "circle-stroke-width": 3.2,
          "circle-stroke-color": ["match", ["get", "state"], "selected", "#f6d58b", "#ffffff"],
        },
      });
    }

    if (!map.getLayer("highlight-label")) {
      map.addLayer({
        id: "highlight-label",
        type: "symbol",
        source: "highlight-restaurant",
        layout: {
          "text-field": ["get", "ratingLabel"],
          "text-size": 12,
          "text-font": ["Noto Sans Bold"],
          "text-offset": [0, 1.45],
          "text-anchor": "top",
          "text-max-width": 13,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#fff8ee",
          "text-halo-color": "#141218",
          "text-halo-width": 2.2,
        },
      });
    }
  }, []);

  /** 让地图自动适配传入的门店列表范围 */
  const fitMapToList = useCallback((list: MapRestaurant[], fallback?: { lng: number; lat: number; zoom: number }) => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;

    isProgrammaticMoveRef.current = true;
    setShowAreaPrompt(false);

    if (list.length === 0) {
      if (fallback) {
        map.flyTo({ center: [fallback.lng, fallback.lat], zoom: fallback.zoom, duration: 650 });
      }
      return;
    }

    if (list.length === 1) {
      map.flyTo({ center: [list[0].lng, list[0].lat], zoom: 15, duration: 650 });
      return;
    }

    const bounds = new maplibre.LngLatBounds();
    for (const r of list) {
      bounds.extend([r.lng, r.lat]);
    }
    map.fitBounds(bounds, {
      padding: { top: 76, right: 56, bottom: 96, left: 56 },
      maxZoom: 15.2,
      duration: 680,
    });
  }, []);

  /** 聚焦某一家餐厅（列表点击、地图点击或快捷键切换共用） */
  const focusRestaurant = useCallback(
    (restaurant: MapRestaurant, opts?: { switchToMap?: boolean; scrollList?: boolean; minZoom?: number }) => {
      setSelectedId(restaurant.id);
      if (opts?.switchToMap) {
        setMobileView("map");
      }

      const fly = () => {
        const map = mapRef.current;
        if (!map) return;
        isProgrammaticMoveRef.current = true;
        setShowAreaPrompt(false);
        map.flyTo({
          center: [restaurant.lng, restaurant.lat],
          zoom: Math.max(map.getZoom(), opts?.minZoom ?? 14.8),
          padding: { top: 40, bottom: 165, left: 20, right: 20 },
          duration: 560,
        });
      };

      if (opts?.switchToMap) {
        window.requestAnimationFrame(() => {
          mapRef.current?.resize();
          fly();
        });
      } else {
        fly();
      }

      if (opts?.scrollList) {
        window.requestAnimationFrame(() => {
          const el = itemRefs.current.get(restaurant.id);
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    },
    []
  );

  // 初始化 MapLibre（仅执行一次，切换底图与筛选均不销毁重建地图）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const maplibre = (await import(
        /* webpackIgnore: true */
        // @ts-expect-error 运行时由 scripts/copy-maplibre.mjs 复制至 public/
        "/maplibre-gl.mjs"
      )) as typeof import("maplibre-gl");
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplibre;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: BASE_STYLES.liberty,
        center: TOKYO_CENTER,
        zoom: 11.2,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        syncMapLayers(map);
        setMapBounds(readBounds(map));
        // 若 URL 带了初始筛选条件，首次加载自动飞到匹配结果范围
        if (mainGeoJsonRef.current.features.length > 0 && mainGeoJsonRef.current.features.length < restaurants.length) {
          const bounds = new maplibre.LngLatBounds();
          for (const f of mainGeoJsonRef.current.features) {
            bounds.extend(f.geometry.coordinates as [number, number]);
          }
          isProgrammaticMoveRef.current = true;
          map.fitBounds(bounds, {
            padding: { top: 80, right: 60, bottom: 96, left: 60 },
            maxZoom: 15,
            duration: 500,
          });
        }
      });

      // 切换底图样式后自动补回业务图层
      map.on("style.load", () => {
        if (cancelled) return;
        syncMapLayers(map);
      });

      // 用户手动拖动或缩放地图结束后，更新当前视野并弹出「在此区域筛选」轻提示
      map.on("moveend", () => {
        if (cancelled) return;
        setMapBounds(readBounds(map));
        if (isProgrammaticMoveRef.current) {
          isProgrammaticMoveRef.current = false;
        } else {
          setShowAreaPrompt(true);
        }
      });

      // 点击聚合气泡：平滑展开到散开层级
      map.on("click", "clusters", (e: MapMouseEvent) => {
        const feature = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId === undefined) return;
        const source = map.getSource("restaurants") as GeoJSONSource | undefined;
        source?.getClusterExpansionZoom(clusterId).then((zoom) => {
          isProgrammaticMoveRef.current = true;
          map.easeTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom: Math.min(zoom + 0.5, 16),
            duration: 460,
          });
        });
      });

      // 点击单个门店或高亮门店
      const handlePointClick = (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        const found = restaurants.find((r) => r.id === id);
        if (!found) return;
        focusRestaurant(found, { scrollList: true, minZoom: 14.2 });
      };
      map.on("click", "points", handlePointClick);
      map.on("click", "point-labels", handlePointClick);
      map.on("click", "highlight-dot", handlePointClick);

      // 点击地图空白处：收起底部预览卡片
      map.on("click", (e: MapMouseEvent) => {
        const interactiveLayers = ["clusters", "points", "point-labels", "highlight-dot"].filter((id) =>
          Boolean(map.getLayer(id))
        );
        const hits = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
        if (hits.length === 0) {
          setSelectedId(null);
        }
      });

      // 悬停手势与高亮反馈
      for (const layer of ["clusters", "points", "point-labels", "highlight-dot"]) {
        map.on("mouseenter", layer, (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
          map.getCanvas().style.cursor = "pointer";
          if (layer !== "clusters") {
            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (id) setHoveredId(id);
          }
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          if (layer !== "clusters") {
            setHoveredId(null);
          }
        });
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, [focusRestaurant, restaurants, syncMapLayers]);

  // 实时同步主门店数据源
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("restaurants") as GeoJSONSource | undefined)?.setData(mainGeoJson);
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [mainGeoJson]);

  // 实时同步高亮数据源（悬停/选中）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource("highlight-restaurant") as GeoJSONSource | undefined)?.setData(highlightGeoJson);
  }, [highlightGeoJson]);

  // 实时同步用户位置数据源
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource("user-location") as GeoJSONSource | undefined)?.setData(userGeoJson);
  }, [userGeoJson]);

  // 侧栏展开/收起或移动端切换回地图时，及时刷新 canvas 尺寸避免留白
  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.resize();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [sidebarOpen, mobileView]);

  // 键盘快捷操作：Esc 关闭浮卡，左右方向键切换上一家/下一家
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.key === "Escape") {
        if (filterDrawerOpen) setFilterDrawerOpen(false);
        else if (selectedId) setSelectedId(null);
        return;
      }

      if (!selectedRestaurant || displayList.length <= 1 || selectedIndex < 0) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = displayList[(selectedIndex + 1) % displayList.length].restaurant;
        focusRestaurant(next, { scrollList: true, minZoom: 14.5 });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = displayList[(selectedIndex - 1 + displayList.length) % displayList.length].restaurant;
        focusRestaurant(prev, { scrollList: true, minZoom: 14.5 });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayList, filterDrawerOpen, focusRestaurant, selectedId, selectedIndex, selectedRestaurant]);

  /** 热门商圈一键切换与地图飞跃 */
  const handleSelectStation = (preset: MapStationPreset) => {
    setBoundsOnly(false);
    setShowAreaPrompt(false);
    if (station === preset.key) {
      setStation("");
      fitMapToList(restaurants);
      return;
    }
    setStation(preset.key);
    const matching = restaurants.filter((r) => r.stationKeys.includes(preset.key));
    fitMapToList(matching, { lng: preset.lng, lat: preset.lat, zoom: preset.zoom });
  };

  /** 重置所有筛选条件 */
  const handleResetAll = () => {
    setQuery("");
    setCuisine("");
    setDishType("");
    setAuthenticity("");
    setStation("");
    setMinRating(0);
    setBoundsOnly(false);
    setShowAreaPrompt(false);
    setSelectedId(null);
    const map = mapRef.current;
    if (map) {
      isProgrammaticMoveRef.current = true;
      map.flyTo({ center: TOKYO_CENTER, zoom: 11.2, duration: 600 });
    }
  };

  /** 调用浏览器定位并自动开启距离排序 */
  const handleLocateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showToast(copy.locateDenied);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setSortBy("distance");
        setBoundsOnly(false);
        const map = mapRef.current;
        if (map) {
          isProgrammaticMoveRef.current = true;
          map.flyTo({ center: [loc.lng, loc.lat], zoom: 14.2, duration: 750 });
        }
      },
      () => {
        setLocating(false);
        showToast(copy.locateDenied);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  /** 切换底图风格（详图 / 素图） */
  const handleToggleBaseStyle = () => {
    const next: BaseStyleKey = baseStyle === "liberty" ? "positron" : "liberty";
    setBaseStyle(next);
    mapRef.current?.setStyle(BASE_STYLES[next]);
  };

  /** 切换上一家 / 下一家 */
  const handleStep = (delta: -1 | 1) => {
    if (displayList.length === 0) return;
    const baseIdx = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIdx = (baseIdx + delta + displayList.length) % displayList.length;
    focusRestaurant(displayList[nextIdx].restaurant, { scrollList: true, minZoom: 14.5 });
  };

  /** 筛选面板公共 UI（桌面侧栏与移动端抽屉共用） */
  const renderFilterDrawerContent = () => (
    <div className="space-y-4">
      {/* 菜系 */}
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wider text-white/55 uppercase">
          <span>{copy.cuisineTitle}</span>
          {cuisine && (
            <button
              type="button"
              onClick={() => setCuisine("")}
              className="text-gold-300 hover:underline"
            >
              {copy.all}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cuisineOptions.map((o) => {
            const count = cuisineCounts.get(o.value) || 0;
            if (count === 0) return null;
            const active = cuisine === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setCuisine(active ? "" : o.value);
                  setBoundsOnly(false);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  active
                    ? "border-gold-300/70 bg-vermilion-700 text-white shadow-[0_0_14px_rgba(230,90,53,0.4)]"
                    : "border-white/12 bg-white/[0.04] text-white/78 hover:border-gold-300/40 hover:text-white"
                }`}
              >
                {o.label}
                <span className={`ml-1 text-[10px] ${active ? "text-white/80" : "text-white/40"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 品类业态 */}
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wider text-white/55 uppercase">
          <span>{copy.dishTitle}</span>
          {dishType && (
            <button
              type="button"
              onClick={() => setDishType("")}
              className="text-gold-300 hover:underline"
            >
              {copy.all}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {dishTypeOptions.map((o) => {
            const count = dishCounts.get(o.value) || 0;
            if (count === 0) return null;
            const active = dishType === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setDishType(active ? "" : o.value);
                  setBoundsOnly(false);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  active
                    ? "border-gold-300/70 bg-vermilion-700 text-white shadow-[0_0_14px_rgba(230,90,53,0.4)]"
                    : "border-white/12 bg-white/[0.04] text-white/78 hover:border-gold-300/40 hover:text-white"
                }`}
              >
                {o.label}
                <span className={`ml-1 text-[10px] ${active ? "text-white/80" : "text-white/40"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 正宗度 & 评分 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
            {copy.authTitle}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {authenticityOptions.map((o) => {
              const active = authenticity === o.value;
              const dotColor = AUTHENTICITY_COLOR[o.value] || AUTHENTICITY_COLOR.unknown;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setAuthenticity(active ? "" : o.value);
                    setBoundsOnly(false);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                    active
                      ? "border-gold-300/70 bg-white/15 text-white"
                      : "border-white/12 bg-white/[0.04] text-white/75 hover:border-white/30"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
            {copy.ratingTitle}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 4, 4.5].map((val) => {
              const active = minRating === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setMinRating(val);
                    setBoundsOnly(false);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? "border-gold-300/70 bg-gold-500/20 text-gold-300"
                      : "border-white/12 bg-white/[0.04] text-white/75 hover:border-white/30"
                  }`}
                >
                  {val === 0 ? copy.all : `★ ${val}+`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部操作条 */}
      <div className="flex items-center justify-between border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={handleResetAll}
          disabled={!hasAnyFilter}
          className="inline-flex items-center gap-1 text-xs font-medium text-white/55 transition-colors hover:text-white disabled:opacity-35"
        >
          <RotateCcw size={12} />
          {copy.resetAll}
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterDrawerOpen(false);
            if (attributeFiltered.length > 0 && attributeFiltered.length < restaurants.length) {
              fitMapToList(attributeFiltered);
            }
          }}
          className="rounded-full bg-gradient-to-r from-[#e05634] to-[#c43f21] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(224,86,52,0.45)] transition-transform hover:scale-[1.02]"
        >
          {copy.applyFilters} ({attributeFiltered.length})
        </button>
      </div>
    </div>
  );

  /** 已激活筛选条件芯片列表（收起筛选抽屉时也能一目了然并单点移除） */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (boundsOnly) {
      chips.push({
        key: "bounds",
        label: copy.areaLocked,
        onClear: () => setBoundsOnly(false),
      });
    }
    if (station) {
      const s = stationPresets.find((item) => item.key === station);
      if (s) {
        chips.push({
          key: "station",
          label: s.label,
          onClear: () => setStation(""),
        });
      }
    }
    if (cuisine) {
      const c = cuisineOptions.find((item) => item.value === cuisine);
      if (c) {
        chips.push({
          key: "cuisine",
          label: c.label,
          onClear: () => setCuisine(""),
        });
      }
    }
    if (dishType) {
      const d = dishTypeOptions.find((item) => item.value === dishType);
      if (d) {
        chips.push({
          key: "dish",
          label: d.label,
          onClear: () => setDishType(""),
        });
      }
    }
    if (authenticity) {
      const a = authenticityOptions.find((item) => item.value === authenticity);
      if (a) {
        chips.push({
          key: "auth",
          label: a.label,
          onClear: () => setAuthenticity(""),
        });
      }
    }
    if (minRating > 0) {
      chips.push({
        key: "rating",
        label: `★ ${minRating}+`,
        onClear: () => setMinRating(0),
      });
    }
    return chips;
  }, [
    boundsOnly,
    copy.areaLocked,
    station,
    stationPresets,
    cuisine,
    cuisineOptions,
    dishType,
    dishTypeOptions,
    authenticity,
    authenticityOptions,
    minRating,
  ]);

  /** 渲染餐厅列表项 */
  const renderListItems = (isMobileMode: boolean) => {
    if (displayList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gold-300">
            <MapPin size={22} />
          </div>
          <p className="text-sm font-semibold text-white/90">{copy.emptyTitle}</p>
          <p className="mt-1.5 text-xs text-white/50">{copy.emptyHint}</p>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={handleResetAll}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold-300/40 bg-gold-500/12 px-4 py-1.5 text-xs font-semibold text-gold-300 transition-colors hover:bg-gold-500/20"
            >
              <RotateCcw size={12} />
              {copy.resetAll}
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="divide-y divide-white/[0.06]">
        {displayList.map(({ restaurant: r, distance }) => {
          const active = r.id === selectedId;
          const dotColor = AUTHENTICITY_COLOR[r.authenticity] || AUTHENTICITY_COLOR.unknown;
          const price = formatPrice(r.priceLevel);

          return (
            <div
              key={r.id}
              ref={(el) => {
                if (el) itemRefs.current.set(r.id, el);
                else itemRefs.current.delete(r.id);
              }}
              onMouseEnter={() => setHoveredId(r.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === r.id ? null : prev))}
              className={`group relative flex gap-3 px-3.5 py-3 transition-colors ${
                active
                  ? "bg-gradient-to-r from-[#e65a35]/18 via-[#e5ab3c]/8 to-transparent"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              {/* 左侧选中指示竖条 */}
              {active && (
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-gold-300 to-vermilion-500" />
              )}

              {/* 主点击区域：定位地图 */}
              <button
                type="button"
                onClick={() => focusRestaurant(r, { switchToMap: isMobileMode })}
                aria-current={active ? "true" : undefined}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <div className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#18161d]">
                  {r.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.photo}
                      alt={r.name}
                      width={74}
                      height={74}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/25">
                      <MapPin size={20} />
                    </div>
                  )}
                  {/* 缩略图左下角正宗度状态点 */}
                  <span
                    title={r.authenticityLabel}
                    className="absolute bottom-1.5 left-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0c0b10]"
                    style={{ backgroundColor: dotColor }}
                  />
                </div>

                <div className="min-w-0 flex-1 pr-6">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold leading-snug text-white group-hover:text-gold-300">
                      {r.name}
                    </span>
                    {r.isTempClosed && (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        {copy.tempClosed}
                      </span>
                    )}
                  </div>

                  {/* 评分 + 评论数 + 价格 */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                    <span className="inline-flex items-center gap-0.5 font-bold text-gold-300">
                      <Star size={11} className="fill-gold-300 text-gold-300" />
                      {r.rating > 0 ? r.rating.toFixed(1) : "—"}
                    </span>
                    {r.reviewCount > 0 && (
                      <span className="text-white/45">
                        ({r.reviewCount}
                        {copy.reviewsUnit})
                      </span>
                    )}
                    {price && <span className="text-white/45">{price}</span>}
                    <span className="text-white/55">{r.authenticityLabel}</span>
                  </div>

                  {/* 菜系 + 品类 */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`cuisine-tag cuisine-${r.cuisine} !py-0 !text-[10.5px]`}>
                      {r.cuisineLabel}
                    </span>
                    {r.dishType !== "other" && (
                      <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0 text-[10.5px] font-medium text-white/70">
                        {r.dishTypeLabel}
                      </span>
                    )}
                  </div>

                  {/* 最近车站或行政区 + 距离 */}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/50">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <TrainFront size={11} className="shrink-0 text-white/40" />
                      <span className="truncate">{r.stationLabel || r.ward}</span>
                    </span>
                    {distance !== null && (
                      <span className="ml-auto shrink-0 font-medium text-sky-300">
                        {formatDistance(distance, isZh)}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* 右上角快捷直达详情页 */}
              <Link
                href={`/${locale}/restaurants/${r.id}`}
                title={copy.detail}
                aria-label={`${r.name} ${copy.detail}`}
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/50 opacity-75 transition-all hover:border-gold-300/50 hover:bg-gold-500/15 hover:text-gold-300 hover:opacity-100"
              >
                <ExternalLink size={13} />
              </Link>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-[#060608]">
      {/* ============================================================
          左侧探索侧栏（桌面端常驻且可折叠；移动端在切换到列表模式时铺满）
         ============================================================ */}
      <aside
        className={`${
          mobileView === "list"
            ? "fixed inset-x-0 top-16 bottom-0 z-30 flex w-full flex-col bg-[#0c0b10]"
            : "hidden"
        } lg:static lg:z-20 lg:flex lg:shrink-0 lg:flex-col lg:border-r lg:border-white/10 lg:bg-[#0c0b10] lg:transition-[width] lg:duration-200 ${
          sidebarOpen ? "lg:w-[392px]" : "lg:w-0 lg:overflow-hidden lg:border-r-0"
        }`}
      >
        {/* 顶部搜索 + 筛选按钮 */}
        <div className="shrink-0 space-y-2.5 border-b border-white/10 bg-[#0e0d13] px-3.5 pt-3 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/40"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (boundsOnly) setBoundsOnly(false);
                }}
                placeholder={copy.searchPlaceholder}
                className="w-full rounded-xl border border-white/12 bg-[#16151d] py-2 pr-8 pl-9 text-xs text-white placeholder:text-white/40 focus:border-gold-300/55 focus:outline-none focus:ring-2 focus:ring-gold-300/15"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5 text-white/45 hover:bg-white/10 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setFilterDrawerOpen((v) => !v)}
              className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                filterDrawerOpen || activeFilterCount > 0
                  ? "border-gold-300/55 bg-gold-500/15 text-gold-300"
                  : "border-white/12 bg-[#16151d] text-white/80 hover:border-white/25 hover:text-white"
              }`}
            >
              <SlidersHorizontal size={14} />
              <span>{copy.filters}</span>
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-vermilion-700 px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* 热门商圈一键直达条 */}
          <div className="scroll-row !gap-1.5 !pb-0.5">
            {stationPresets.slice(0, 12).map((preset) => {
              const active = station === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleSelectStation(preset)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    active
                      ? "border-gold-300/70 bg-vermilion-700 text-white shadow-[0_2px_10px_rgba(230,90,53,0.4)]"
                      : "border-white/10 bg-white/[0.04] text-white/72 hover:border-gold-300/40 hover:text-white"
                  }`}
                >
                  {preset.label}
                  <span className={`ml-1 text-[10px] ${active ? "text-white/80" : "text-white/40"}`}>
                    {preset.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 展开的高级筛选抽屉 */}
          {filterDrawerOpen && (
            <div className="rounded-xl border border-white/12 bg-[#13121a] p-3.5 shadow-xl">
              {renderFilterDrawerContent()}
            </div>
          )}

          {/* 已激活筛选条件芯片 */}
          {!filterDrawerOpen && activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClear}
                  className="inline-flex items-center gap-1 rounded-full border border-gold-300/35 bg-gold-500/12 px-2.5 py-0.5 text-[11px] font-medium text-gold-300 transition-colors hover:bg-gold-500/20"
                >
                  <span>{chip.label}</span>
                  <X size={11} />
                </button>
              ))}
              <button
                type="button"
                onClick={handleResetAll}
                className="ml-1 text-[11px] text-white/45 underline-offset-2 hover:text-white hover:underline"
              >
                {copy.resetAll}
              </button>
            </div>
          )}

          {/* 数量统计 + 排序切换 */}
          <div className="flex items-center justify-between pt-0.5 text-[11.5px]">
            <div className="flex items-center gap-1.5 text-white/65">
              <span className="font-bold text-white">{displayList.length}</span>
              <span>{copy.countUnit}</span>
              {boundsOnly && attributeFiltered.length > displayList.length && (
                <span className="text-white/40">/ {attributeFiltered.length}</span>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#15141c] p-0.5">
              <ArrowUpDown size={11} className="ml-1.5 text-white/40" />
              {(
                [
                  { key: "rating", label: copy.sortRating },
                  { key: "reviews", label: copy.sortReviews },
                  ...(userLocation ? [{ key: "distance" as const, label: copy.sortDistance }] : []),
                ] as { key: SortKey; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortBy(opt.key)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    sortBy === opt.key
                      ? "bg-white/12 text-gold-300"
                      : "text-white/55 hover:text-white/90"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 餐厅滚动列表（overscroll-contain 避免带动外层页面滚动） */}
        <div className="map-dark-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-20 lg:pb-4">
          {renderListItems(mobileView === "list")}
        </div>
      </aside>

      {/* ============================================================
          右侧沉浸式地图主画布
         ============================================================ */}
      <div className="relative h-full min-w-0 flex-1 bg-[#0e0d13]">
        {/* 垫底加载文案，地图渲染后自然覆盖 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/45">
          {copy.loading}
        </div>

        {/* MapLibre 容器 */}
        <div ref={containerRef} className="relative h-full w-full" />

        {/* 桌面端：侧栏折叠/展开浮动按钮 */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? copy.collapseSidebar : copy.expandSidebar}
          className="absolute top-3.5 left-3.5 z-10 hidden h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-[#0e0d13]/90 px-3 text-xs font-semibold text-white/90 shadow-lg backdrop-blur-md transition-all hover:border-gold-300/50 hover:text-gold-300 lg:inline-flex"
        >
          {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          {!sidebarOpen && (
            <span>
              {copy.expandSidebar} ({displayList.length})
            </span>
          )}
        </button>

        {/* 移动端：顶部悬浮搜索 + 筛选 + 商圈条（仅在地图视图显示） */}
        {mobileView === "map" && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 lg:hidden">
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/50"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (boundsOnly) setBoundsOnly(false);
                  }}
                  placeholder={copy.searchPlaceholder}
                  className="w-full rounded-xl border border-white/18 bg-[#0e0d13]/92 py-2.5 pr-8 pl-9 text-xs text-white shadow-xl backdrop-blur-md placeholder:text-white/45 focus:border-gold-300/60 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5 text-white/55"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setFilterDrawerOpen((v) => !v)}
                className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold shadow-xl backdrop-blur-md ${
                  filterDrawerOpen || activeFilterCount > 0
                    ? "border-gold-300/60 bg-[#1c1610]/95 text-gold-300"
                    : "border-white/18 bg-[#0e0d13]/92 text-white/90"
                }`}
              >
                <SlidersHorizontal size={14} />
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-vermilion-700 px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* 移动端快捷商圈胶囊 */}
            <div className="scroll-row pointer-events-auto !gap-1.5 !pb-0">
              {stationPresets.slice(0, 10).map((preset) => {
                const active = station === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => handleSelectStation(preset)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-md backdrop-blur-md ${
                      active
                        ? "border-gold-300/70 bg-vermilion-700 text-white"
                        : "border-white/15 bg-[#0e0d13]/88 text-white/85"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* 移动端弹出筛选面板 */}
            {filterDrawerOpen && (
              <div className="pointer-events-auto max-h-[62vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0f0e15]/96 p-4 shadow-2xl backdrop-blur-xl">
                {renderFilterDrawerContent()}
              </div>
            )}
          </div>
        )}

        {/* 拖动地图后居中弹出：「在此区域筛选 (X 家)」或取消视野锁定胶囊 */}
        {(showAreaPrompt || boundsOnly) && (
          <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center px-4 lg:top-3.5">
            {boundsOnly && !showAreaPrompt ? (
              <button
                type="button"
                onClick={() => setBoundsOnly(false)}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-gold-300/50 bg-[#0e0d13]/92 px-3.5 py-1.5 text-xs font-semibold text-gold-300 shadow-xl backdrop-blur-md transition-transform hover:scale-[1.02]"
              >
                <span>
                  {copy.areaLocked} ({displayList.length})
                </span>
                <X size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setBoundsOnly(true);
                  setShowAreaPrompt(false);
                }}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-[#0e0d13]/92 px-4 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition-all hover:border-gold-300/60 hover:text-gold-300"
              >
                <Search size={12} className="text-gold-300" />
                <span>
                  {copy.searchThisArea} ({inBoundsCount} {copy.countUnit})
                </span>
              </button>
            )}
          </div>
        )}

        {/* 地图右侧统一暗黑玻璃工具栏（缩放、定位、全览、底图切换） */}
        <div className="absolute top-[104px] right-3 z-10 flex flex-col gap-2 lg:top-3.5 lg:right-3.5">
          {/* 缩放控制组（桌面端显示，手机端用双指捏合更清爽） */}
          <div className="hidden flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0e0d13]/90 shadow-lg backdrop-blur-md lg:flex">
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn({ duration: 240 })}
              title={copy.zoomIn}
              aria-label={copy.zoomIn}
              className="flex h-9 w-9 items-center justify-center border-b border-white/10 text-white/85 transition-colors hover:bg-white/[0.06] hover:text-gold-300"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut({ duration: 240 })}
              title={copy.zoomOut}
              aria-label={copy.zoomOut}
              className="flex h-9 w-9 items-center justify-center text-white/85 transition-colors hover:bg-white/[0.06] hover:text-gold-300"
            >
              <Minus size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            title={copy.locateMe}
            aria-label={copy.locateMe}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border shadow-lg backdrop-blur-md transition-all ${
              userLocation
                ? "border-sky-400/60 bg-sky-500/20 text-sky-300"
                : "border-white/15 bg-[#0e0d13]/90 text-white/85 hover:border-gold-300/50 hover:text-gold-300"
            }`}
          >
            <LocateFixed size={16} className={locating ? "animate-pulse" : ""} />
          </button>

          <button
            type="button"
            onClick={() => {
              setBoundsOnly(false);
              fitMapToList(attributeFiltered.length > 0 ? attributeFiltered : restaurants);
            }}
            title={copy.fitAll}
            aria-label={copy.fitAll}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-[#0e0d13]/90 text-white/85 shadow-lg backdrop-blur-md transition-all hover:border-gold-300/50 hover:text-gold-300"
          >
            <Maximize2 size={15} />
          </button>

          <button
            type="button"
            onClick={handleToggleBaseStyle}
            title={baseStyle === "liberty" ? copy.stylePositron : copy.styleLiberty}
            aria-label={baseStyle === "liberty" ? copy.stylePositron : copy.styleLiberty}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border shadow-lg backdrop-blur-md transition-all ${
              baseStyle === "positron"
                ? "border-gold-300/55 bg-gold-500/18 text-gold-300"
                : "border-white/15 bg-[#0e0d13]/90 text-white/85 hover:border-gold-300/50 hover:text-gold-300"
            }`}
          >
            <Layers size={15} />
          </button>
        </div>

        {/* 桌面端左下角轻量配色图例 */}
        {!selectedRestaurant && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden items-center gap-3 rounded-full border border-white/12 bg-[#0e0d13]/85 px-3.5 py-1.5 text-[11px] text-white/75 shadow-lg backdrop-blur-md lg:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AUTHENTICITY_COLOR.authentic }} />
              {copy.legendAuthentic}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AUTHENTICITY_COLOR.adapted }} />
              {copy.legendAdapted}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AUTHENTICITY_COLOR.japanese }} />
              {copy.legendJapanese}
            </span>
          </div>
        )}

        {/* 轻量 Toast 提示（如定位权限失败） */}
        {toastMsg && (
          <div className="pointer-events-none absolute inset-x-4 bottom-24 z-30 flex justify-center lg:bottom-8">
            <div className="rounded-full border border-white/15 bg-[#16141d]/95 px-4 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-md">
              {toastMsg}
            </div>
          </div>
        )}

        {/* ============================================================
            全新暗黑磨砂玻璃底部详情预览卡片（取代粗糙白底 HTML Popup）
           ============================================================ */}
        {selectedRestaurant && (
          <div className="pointer-events-none absolute inset-x-3 bottom-16 z-20 flex justify-center lg:inset-x-6 lg:bottom-5">
            <div className="pointer-events-auto relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-gold-300/30 bg-[#100f16]/94 shadow-[0_24px_64px_rgba(0,0,0,0.82),0_0_28px_rgba(235,168,52,0.16)] backdrop-blur-xl">
              {/* 顶部暖金微光细线 */}
              <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-gold-300/75 to-transparent" />

              <div className="flex flex-col sm:flex-row">
                {/* 封面图 */}
                <Link
                  href={`/${locale}/restaurants/${selectedRestaurant.id}`}
                  className="relative block h-36 w-full shrink-0 overflow-hidden bg-[#1a1820] sm:h-auto sm:w-44"
                >
                  {selectedRestaurant.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedRestaurant.photo}
                      alt={selectedRestaurant.name}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/25">
                      <MapPin size={28} />
                    </div>
                  )}
                  <span className={`badge-${selectedRestaurant.authenticity} absolute top-2.5 left-2.5 !text-[10.5px]`}>
                    {selectedRestaurant.authenticityLabel}
                  </span>
                  {selectedRestaurant.rating > 0 && (
                    <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-xs font-bold text-gold-300 backdrop-blur-sm">
                      <Star size={11} className="fill-gold-300 text-gold-300" />
                      {selectedRestaurant.rating.toFixed(1)}
                    </span>
                  )}
                </Link>

                {/* 右侧信息与操作 */}
                <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5 sm:p-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/${locale}/restaurants/${selectedRestaurant.id}`}
                        className="line-clamp-1 font-serif text-base font-black text-white transition-colors hover:text-gold-300"
                      >
                        {selectedRestaurant.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        aria-label="Close"
                        className="-mt-0.5 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {/* 标签行 */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`cuisine-tag cuisine-${selectedRestaurant.cuisine}`}>
                        {selectedRestaurant.cuisineLabel}
                      </span>
                      {selectedRestaurant.dishType !== "other" && (
                        <span className="rounded border border-white/12 bg-white/[0.06] px-2 py-0.5 font-medium text-white/80">
                          {selectedRestaurant.dishTypeLabel}
                        </span>
                      )}
                      {formatPrice(selectedRestaurant.priceLevel) && (
                        <span className="text-white/55">{formatPrice(selectedRestaurant.priceLevel)}</span>
                      )}
                      {selectedRestaurant.reviewCount > 0 && (
                        <span className="text-white/50">
                          {selectedRestaurant.reviewCount}
                          {copy.reviewsUnit}
                        </span>
                      )}
                    </div>

                    {/* 车站 / 行政区 / 距我距离 */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/65">
                      <span className="inline-flex items-center gap-1">
                        <TrainFront size={13} className="text-gold-300/80" />
                        {selectedRestaurant.stationLabel || selectedRestaurant.ward}
                      </span>
                      {selectedDistance !== null && (
                        <span className="inline-flex items-center gap-1 font-medium text-sky-300">
                          <MapPin size={12} />
                          {copy.fromMe} {formatDistance(selectedDistance, isZh)}
                        </span>
                      )}
                    </div>

                    {/* AI 一句话精华亮点 */}
                    {selectedRestaurant.summarySnippet && (
                      <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-white/65">
                        <Sparkles size={11} className="mr-1 inline -translate-y-[1px] text-gold-300" />
                        {selectedRestaurant.summarySnippet}
                      </p>
                    )}
                  </div>

                  {/* 底部操作按钮 + 上一家/下一家切换 */}
                  <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${locale}/restaurants/${selectedRestaurant.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#e05634] to-[#bf3c1f] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_6px_18px_-4px_rgba(224,86,52,0.55)] transition-transform hover:scale-[1.02]"
                      >
                        {copy.detail}
                        <ChevronRight size={13} />
                      </Link>
                      <a
                        href={selectedRestaurant.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-white/88 transition-colors hover:border-gold-300/50 hover:text-gold-300"
                      >
                        <Navigation size={12} />
                        {copy.openInMaps}
                      </a>
                    </div>

                    {displayList.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStep(-1)}
                          title={copy.prevShop}
                          aria-label={copy.prevShop}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-white/75 transition-colors hover:border-gold-300/50 hover:text-gold-300"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStep(1)}
                          title={copy.nextShop}
                          aria-label={copy.nextShop}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-white/75 transition-colors hover:border-gold-300/50 hover:text-gold-300"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          移动端底部悬浮「列表 / 地图」切换大胶囊
         ============================================================ */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-gold-300/45 bg-[#121018]/95 px-5 py-2.5 text-xs font-bold text-white shadow-[0_12px_32px_rgba(0,0,0,0.72),0_0_20px_rgba(235,168,52,0.22)] backdrop-blur-xl transition-transform active:scale-95"
        >
          {mobileView === "map" ? (
            <>
              <List size={15} className="text-gold-300" />
              <span>
                {copy.viewList} ({displayList.length})
              </span>
            </>
          ) : (
            <>
              <MapIcon size={15} className="text-gold-300" />
              <span>{copy.viewMap}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

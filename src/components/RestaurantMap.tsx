"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LocateFixed, MapPin, Star } from "lucide-react";

export interface MapRestaurant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  rawRating: number;
  cuisineLabel: string;
  cuisineType: string;
  authenticityLabel: string;
  authenticity: string;
  summary: string | null;
  ward: string | null;
}

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface MapOptions {
  center: LatLngLiteral;
  zoom: number;
  mapTypeControl?: boolean;
  streetViewControl?: boolean;
  fullscreenControl?: boolean;
  clickableIcons?: boolean;
  styles?: Array<Record<string, unknown>>;
}

interface GoogleMap {
  fitBounds(bounds: LatLngBounds): void;
  panTo(position: LatLngLiteral): void;
  setZoom(zoom: number): void;
}

interface LatLngBounds {
  extend(position: LatLngLiteral): void;
}

interface GoogleMarker {
  addListener(eventName: "click", handler: () => void): void;
  setMap(map: GoogleMap | null): void;
}

interface MarkerOptions {
  map: GoogleMap;
  position: LatLngLiteral;
  title: string;
  icon?: {
    path: number;
    scale: number;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeWeight: number;
  };
}

interface InfoWindow {
  open(options: { map: GoogleMap; anchor: GoogleMarker }): void;
}

interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: MapOptions) => GoogleMap;
  Marker: new (options: MarkerOptions) => GoogleMarker;
  InfoWindow: new (options: { content: string }) => InfoWindow;
  LatLngBounds: new () => LatLngBounds;
  SymbolPath: { CIRCLE: number };
}

declare global {
  interface Window {
    google?: {
      maps: GoogleMapsApi;
    };
  }
}

type Props = {
  apiKey: string;
  restaurants: MapRestaurant[];
  locale: string;
  selectedId?: string;
};

const TOKYO_CENTER = { lat: 35.681236, lng: 139.767125 };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-maps='true']");
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("Google Maps failed to initialize"));
      });
      existingScript.addEventListener("error", () => reject(new Error("Google Maps script failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=ja&region=JP`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps failed to initialize"));
    };
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
}

function getMarkerColor(authenticity: string): string {
  if (authenticity === "authentic") return "#a52a22";
  if (authenticity === "adapted") return "#c9a227";
  if (authenticity === "japanese") return "#4677a8";
  return "#7f7668";
}

export default function RestaurantMap({ apiKey, restaurants, locale, selectedId }: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(selectedId || restaurants[0]?.id || "");
  const [mapError, setMapError] = useState<string | null>(null);

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0],
    [restaurants, selectedRestaurantId]
  );
  const missingApiKeyMessage = !apiKey
    ? locale === "zh" ? "缺少 Google Maps API Key" : "Google Maps API Key がありません"
    : null;
  const displayMapError = missingApiKeyMessage || mapError;

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    if (!mapElementRef.current || restaurants.length === 0) return;

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapElementRef.current) return;

        const map = new maps.Map(mapElementRef.current, {
          center: selectedRestaurant ? { lat: selectedRestaurant.lat, lng: selectedRestaurant.lng } : TOKYO_CENTER,
          zoom: selectedRestaurant ? 14 : 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          styles: [
            { featureType: "poi.business", stylers: [{ visibility: "off" }] },
            { featureType: "transit.station", stylers: [{ saturation: -35 }] },
            { featureType: "water", stylers: [{ color: "#d8e7e5" }] },
            { featureType: "landscape", stylers: [{ color: "#f7f1e6" }] },
          ],
        });

        mapRef.current = map;
        const bounds = new maps.LatLngBounds();

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = restaurants.map((restaurant) => {
          const position = { lat: restaurant.lat, lng: restaurant.lng };
          bounds.extend(position);

          const marker = new maps.Marker({
            map,
            position,
            title: restaurant.name,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: restaurant.id === selectedRestaurantId ? 10 : 8,
              fillColor: getMarkerColor(restaurant.authenticity),
              fillOpacity: 0.95,
              strokeColor: "#fff8eb",
              strokeWeight: 2,
            },
          });

          const content = `
            <div style="max-width:240px;font-family:system-ui,sans-serif;color:#2f2722">
              <strong style="display:block;margin-bottom:4px">${escapeHtml(restaurant.name)}</strong>
              <div style="font-size:12px;margin-bottom:6px">${escapeHtml(restaurant.cuisineLabel)} · ${escapeHtml(restaurant.authenticityLabel)}</div>
              <div style="font-size:12px;color:#6f6258">${escapeHtml(restaurant.address)}</div>
            </div>
          `;
          const infoWindow = new maps.InfoWindow({ content });

          marker.addListener("click", () => {
            setSelectedRestaurantId(restaurant.id);
            map.panTo(position);
            map.setZoom(15);
            infoWindow.open({ map, anchor: marker });
          });

          return marker;
        });

        if (restaurants.length > 1) {
          map.fitBounds(bounds);
        }
      })
      .catch((error: Error) => setMapError(error.message));

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [apiKey, locale, restaurants, selectedRestaurant, selectedRestaurantId]);

  useEffect(() => {
    if (!selectedRestaurant || !mapRef.current) return;
    mapRef.current.panTo({ lat: selectedRestaurant.lat, lng: selectedRestaurant.lng });
    mapRef.current.setZoom(15);
  }, [selectedRestaurant]);

  const copy = locale === "zh"
    ? {
        empty: "当前筛选条件下没有可显示在地图上的餐厅。",
        viewDetail: "查看详情",
        focused: "当前定位",
      }
    : {
        empty: "現在の条件では地図に表示できるレストランがありません。",
        viewDetail: "詳細を見る",
        focused: "選択中",
      };

  if (restaurants.length === 0) {
    return (
      <div className="py-20 text-center text-ink-400">
        {copy.empty}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
      <aside className="order-2 lg:order-1">
        <div className="lg:sticky lg:top-24 flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-warm-200 bg-white shadow-sm">
          <div className="border-b border-warm-200 px-4 py-3 text-sm font-semibold text-ink-700">
            {restaurants.length} {locale === "zh" ? "家餐厅" : "件"}
          </div>
          <div className="overflow-auto">
            {restaurants.map((restaurant) => {
              const selected = restaurant.id === selectedRestaurantId;
              return (
                <div key={restaurant.id} className={`border-b border-warm-100 transition-colors hover:bg-warm-50 ${selected ? "bg-vermilion-50" : "bg-white"}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedRestaurantId(restaurant.id)}
                    className="w-full px-4 py-4 text-left"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold leading-snug text-ink-900">{restaurant.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                          <span className={`cuisine-tag cuisine-${restaurant.cuisineType}`}>{restaurant.cuisineLabel}</span>
                          <span>{restaurant.ward || restaurant.address}</span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-warm-50 px-2 py-1 text-xs font-bold text-ink-900">
                        <Star size={13} className="fill-gold-500 text-gold-500" />
                        {restaurant.rating.toFixed(1)}
                      </span>
                    </div>
                  </button>
                  {selected && (
                    <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs text-vermilion-700">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <LocateFixed size={13} />
                        {copy.focused}
                      </span>
                      <Link
                        href={`/${locale}/restaurants/${restaurant.id}`}
                        className="font-semibold underline underline-offset-4"
                      >
                        {copy.viewDetail}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="order-1 lg:order-2">
        <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-xl border border-warm-200 bg-warm-100 shadow-sm">
          <div ref={mapElementRef} className="h-full w-full" />
          {displayMapError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-warm-100 px-6 text-center text-ink-700">
              <MapPin size={28} className="text-vermilion-700" />
              <div className="font-bold">{displayMapError}</div>
              <p className="max-w-md text-sm text-ink-400">
                {locale === "zh"
                  ? "地图脚本不可用时，仍可使用左侧餐厅列表继续浏览。"
                  : "地図スクリプトが利用できない場合も、左側のリストから閲覧できます。"}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

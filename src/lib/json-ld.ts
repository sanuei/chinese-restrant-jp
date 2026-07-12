import {
  getRating,
  getRestaurantName,
  normalizePriceLevel,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
} from "@/lib/restaurant-types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://gachi.soniclab.cc";

function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path}`;
}

const CUISINE_SCHEMA_LABEL: Record<string, string> = {
  sichuan: "Sichuan cuisine",
  cantonese: "Cantonese cuisine",
  northern: "Northern Chinese cuisine",
  fujian: "Fujian cuisine",
  hunan: "Hunan cuisine",
  jiangsu: "Jiangsu cuisine",
  northwest: "Northwestern Chinese cuisine",
  yunnan: "Yunnan cuisine",
  other: "Chinese cuisine",
};

const PRICE_RANGE: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

export function buildRestaurantJsonLd(restaurant: RestaurantRow, locale: string) {
  const name = getRestaurantName(restaurant, locale);
  const url = absoluteUrl(`/${locale}/restaurants/${restaurant.id}`);
  const photos = parsePhotoReferences(restaurant.photos).slice(0, 5);
  const rating = getRating(restaurant);
  const priceLevel = normalizePriceLevel(restaurant.price_level);

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    url,
    ...(photos.length > 0 ? { image: photos.map((ref) => absoluteUrl(photoSrc(ref, 800))) } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: restaurant.address,
      addressLocality: restaurant.ward || restaurant.city || undefined,
      addressCountry: "JP",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: restaurant.lat,
      longitude: restaurant.lng,
    },
    ...(restaurant.phone ? { telephone: restaurant.phone } : {}),
    ...(rating > 0 && restaurant.raw_review_count
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(rating.toFixed(1)),
            reviewCount: restaurant.raw_review_count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    servesCuisine: CUISINE_SCHEMA_LABEL[restaurant.cuisine_type || "other"] || "Chinese cuisine",
    ...(priceLevel ? { priceRange: PRICE_RANGE[priceLevel] } : {}),
  };
}

export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function buildOrganizationJsonLd(locale: string) {
  const name = locale === "zh" ? "真味中华" : "ガチ中華ナビ";
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: absoluteUrl(`/${locale}`),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl(`/${locale}/restaurants?q={search_term_string}`),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

// 转义 `<`，避免 JSON 里出现 </script> 提前把标签闭合
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

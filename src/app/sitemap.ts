import type { MetadataRoute } from "next";
import { getDb } from "@/lib/cloudflare";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gachi.soniclab.cc";
const locales = ["zh", "ja"] as const;
const staticRoutes = ["", "restaurants", "cuisines", "map", "verify", "contact"] as const;

function urlFor(path: string): string {
  return `${siteUrl}${path}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const route of staticRoutes) {
      entries.push({
        url: urlFor(`/${locale}${route ? `/${route}` : ""}`),
        lastModified: now,
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1 : 0.75,
      });
    }
  }

  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare("SELECT id, updated_at FROM restaurants WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 500")
      .all<{ id: string; updated_at: string | null }>();

    for (const restaurant of results) {
      for (const locale of locales) {
        entries.push({
          url: urlFor(`/${locale}/restaurants/${restaurant.id}`),
          lastModified: restaurant.updated_at ? new Date(restaurant.updated_at) : now,
          changeFrequency: "weekly",
          priority: 0.65,
        });
      }
    }
  } catch {
    // Sitemap should still expose the main routes if D1 is temporarily unavailable.
  }

  return entries;
}

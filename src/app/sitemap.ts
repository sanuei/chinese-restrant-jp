import type { MetadataRoute } from "next";
import { getDb } from "@/lib/cloudflare";
import { landingPath } from "@/lib/landing";
import { getLightRows, indexableLandings } from "@/lib/landing-data";

// 必须按请求生成：默认会在构建时预渲染成静态文件，而构建时连不上 D1，
// 结果线上 sitemap 只剩固定页面，餐厅详情页和落地页全被漏掉
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gachi.soniclab.cc";
const locales = ["zh", "ja"] as const;
const staticRoutes = ["", "restaurants", "cuisines", "map", "verify", "contact"] as const;

function urlFor(path: string): string {
  return `${siteUrl}${path}`;
}

function languageAlternates(pathForLocale: (locale: (typeof locales)[number]) => string) {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = urlFor(pathForLocale(locale));
  }
  languages["x-default"] = urlFor(pathForLocale("zh"));
  return languages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const route of staticRoutes) {
    for (const locale of locales) {
      entries.push({
        url: urlFor(`/${locale}${route ? `/${route}` : ""}`),
        lastModified: now,
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1 : 0.75,
        alternates: {
          languages: languageAlternates((l) => `/${l}${route ? `/${route}` : ""}`),
        },
      });
    }
  }

  // 车站 / 菜系 / 品类落地页，只收录达到家数门槛的组合
  for (const { filter } of indexableLandings(await getLightRows())) {
    const path = landingPath(filter);
    for (const locale of locales) {
      entries.push({
        url: urlFor(`/${locale}${path}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: filter.area && filter.category ? 0.6 : 0.8,
        alternates: { languages: languageAlternates((l) => `/${l}${path}`) },
      });
    }
  }

  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare("SELECT id, updated_at FROM restaurants WHERE is_active = 1 ORDER BY updated_at DESC")
      .all<{ id: string; updated_at: string | null }>();

    for (const restaurant of results) {
      for (const locale of locales) {
        entries.push({
          url: urlFor(`/${locale}/restaurants/${restaurant.id}`),
          lastModified: restaurant.updated_at ? new Date(restaurant.updated_at) : now,
          changeFrequency: "weekly",
          priority: 0.65,
          alternates: {
            languages: languageAlternates((l) => `/${l}/restaurants/${restaurant.id}`),
          },
        });
      }
    }
  } catch {
    // Sitemap should still expose the main routes if D1 is temporarily unavailable.
  }

  return entries;
}

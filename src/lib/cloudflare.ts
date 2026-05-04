import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const ctx = await getCloudflareContext();
  return ctx.env.DB;
}

export async function getCache() {
  const ctx = await getCloudflareContext();
  return ctx.env.CACHE;
}

export async function getImagesBucket() {
  const ctx = await getCloudflareContext();
  return ctx.env.IMAGES;
}

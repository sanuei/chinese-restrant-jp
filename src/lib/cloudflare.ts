import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ensureAppSchema } from "@/lib/restaurant-schema";

let schemaReady: Promise<void> | null = null;

export async function getDb() {
  const ctx = await getCloudflareContext();
  if (!schemaReady) {
    schemaReady = ensureAppSchema(ctx.env.DB).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
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

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id || null;
}

function parseRestaurantId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const restaurantId = (body as Record<string, unknown>).restaurantId;
  return typeof restaurantId === "string" && restaurantId.length > 0 ? restaurantId : null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const { results = [] } = await db
    .prepare(`SELECT restaurant_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<{ restaurant_id: string }>();

  return Response.json({ favorites: results.map((row) => row.restaurant_id) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const restaurantId = parseRestaurantId(await request.json().catch(() => null));
  if (!restaurantId) {
    return Response.json({ error: "invalid restaurantId" }, { status: 400 });
  }

  const db = await getDb();
  await db
    .prepare(`
      INSERT INTO favorites (id, user_id, restaurant_id) VALUES (?, ?, ?)
      ON CONFLICT(user_id, restaurant_id) DO NOTHING
    `)
    .bind(`${userId}_${restaurantId}`, userId, restaurantId)
    .run();

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const restaurantId = parseRestaurantId(await request.json().catch(() => null));
  if (!restaurantId) {
    return Response.json({ error: "invalid restaurantId" }, { status: 400 });
  }

  const db = await getDb();
  await db
    .prepare(`DELETE FROM favorites WHERE user_id = ? AND restaurant_id = ?`)
    .bind(userId, restaurantId)
    .run();

  return Response.json({ ok: true });
}

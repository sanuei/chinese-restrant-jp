import { NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db
      .prepare(
        `SELECT cuisine_type, COUNT(*) as count
         FROM restaurants
         WHERE is_active = 1
         GROUP BY cuisine_type`
      )
      .all<{ cuisine_type: string; count: number }>();

    const counts: Record<string, number> = {};
    for (const row of result.results ?? []) {
      counts[row.cuisine_type] = row.count;
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Cuisine counts error:", error);
    return NextResponse.json({ counts: {} });
  }
}

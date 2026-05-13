import { computeValueScore } from "@/lib/restaurant-metrics";
import { buildRestaurantSearchShadows, SEARCH_SHADOW_FIELDS } from "@/lib/restaurant-search-index";

type TableInfoRow = {
  name: string;
};

type RestaurantBackfillRow = {
  id: string;
  name_zh: string | null;
  name_ja: string | null;
  name_original: string | null;
  address: string | null;
  ward: string | null;
  ai_summary_zh: string | null;
  ai_summary_ja: string | null;
  authenticity_reason_zh: string | null;
  authenticity_reason_ja: string | null;
  trusted_rating: number | null;
  price_level: number | null;
  raw_review_count: number | null;
  value_score: number | null;
} & Partial<Record<(typeof SEARCH_SHADOW_FIELDS)[number], string | null>>;

const RESTAURANT_COLUMN_DEFS: Record<string, string> = {
  value_score: "INTEGER",
  name_zh_search: "TEXT",
  name_ja_search: "TEXT",
  name_original_search: "TEXT",
  address_search: "TEXT",
  ward_search: "TEXT",
  ai_summary_zh_search: "TEXT",
  ai_summary_ja_search: "TEXT",
  authenticity_reason_zh_search: "TEXT",
  authenticity_reason_ja_search: "TEXT",
};

function needsSearchBackfill(row: RestaurantBackfillRow): boolean {
  return SEARCH_SHADOW_FIELDS.some((field) => row[field] == null);
}

export async function ensureAppSchema(db: D1Database): Promise<void> {
  const { results = [] } = await db.prepare("PRAGMA table_info(restaurants)").all<TableInfoRow>();
  if (!results.length) return;

  const existingColumns = new Set(results.map((row) => row.name));
  let schemaChanged = false;

  for (const [column, definition] of Object.entries(RESTAURANT_COLUMN_DEFS)) {
    if (existingColumns.has(column)) continue;
    await db.prepare(`ALTER TABLE restaurants ADD COLUMN ${column} ${definition}`).run();
    schemaChanged = true;
  }

  const whereClauses = schemaChanged
    ? ["1 = 1"]
    : ["value_score IS NULL", ...SEARCH_SHADOW_FIELDS.map((field) => `${field} IS NULL`)];

  const selectFields = [
    "id",
    "name_zh",
    "name_ja",
    "name_original",
    "address",
    "ward",
    "ai_summary_zh",
    "ai_summary_ja",
    "authenticity_reason_zh",
    "authenticity_reason_ja",
    "trusted_rating",
    "price_level",
    "raw_review_count",
    "value_score",
    ...SEARCH_SHADOW_FIELDS,
  ];

  const { results: rows = [] } = await db.prepare(
    `SELECT ${selectFields.join(", ")} FROM restaurants WHERE ${whereClauses.join(" OR ")}`
  ).all<RestaurantBackfillRow>();

  if (!rows.length) return;

  const updateStmt = db.prepare(`
    UPDATE restaurants
    SET
      value_score = ?,
      name_zh_search = ?,
      name_ja_search = ?,
      name_original_search = ?,
      address_search = ?,
      ward_search = ?,
      ai_summary_zh_search = ?,
      ai_summary_ja_search = ?,
      authenticity_reason_zh_search = ?,
      authenticity_reason_ja_search = ?
    WHERE id = ?
  `);

  const statements = rows.map((row) => {
    const shadows = needsSearchBackfill(row)
      ? buildRestaurantSearchShadows(row)
      : {
          name_zh_search: row.name_zh_search || "",
          name_ja_search: row.name_ja_search || "",
          name_original_search: row.name_original_search || "",
          address_search: row.address_search || "",
          ward_search: row.ward_search || "",
          ai_summary_zh_search: row.ai_summary_zh_search || "",
          ai_summary_ja_search: row.ai_summary_ja_search || "",
          authenticity_reason_zh_search: row.authenticity_reason_zh_search || "",
          authenticity_reason_ja_search: row.authenticity_reason_ja_search || "",
        };

    return updateStmt.bind(
      row.value_score ?? computeValueScore(row.trusted_rating, row.price_level, row.raw_review_count),
      shadows.name_zh_search,
      shadows.name_ja_search,
      shadows.name_original_search,
      shadows.address_search,
      shadows.ward_search,
      shadows.ai_summary_zh_search,
      shadows.ai_summary_ja_search,
      shadows.authenticity_reason_zh_search,
      shadows.authenticity_reason_ja_search,
      row.id
    );
  });

  await db.batch(statements);
}

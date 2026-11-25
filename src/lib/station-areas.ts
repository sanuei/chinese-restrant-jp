/**
 * 热门商圈 / 车站分组配置
 *
 * 首页「按车站找餐厅」计数与 /restaurants?station=<key> 列表筛选共用这份规则，
 * 保证首页显示的家数与点进去看到的列表 100% 一致，同时把同一商圈的相邻站点合并
 * （如 上野 + 御徒町 + 湯島、横浜中華街 = 元町・中華街 + 石川町 + 日本大通り）。
 */
export const stationAreas = [
  { key: "ikebukuro", zh: "池袋", ja: "池袋", matchTerms: ["池袋"] },
  { key: "ueno", zh: "上野・御徒町", ja: "上野・御徒町", matchTerms: ["上野", "御徒町", "湯島"] },
  { key: "takadanobaba", zh: "高田马场", ja: "高田馬場", matchTerms: ["高田馬場"] },
  { key: "shinkoiwa", zh: "新小岩・小岩", ja: "新小岩・小岩", matchTerms: ["小岩"] },
  { key: "shinjuku", zh: "新宿", ja: "新宿", matchTerms: ["新宿"] },
  { key: "roppongi", zh: "六本木・麻布", ja: "六本木・麻布", matchTerms: ["六本木", "麻布十番", "赤坂"] },
  { key: "akihabara", zh: "秋叶原・神田", ja: "秋葉原・神田", matchTerms: ["秋葉原", "末広町", "神田", "神保町"] },
  { key: "kameido", zh: "亀戸・锦糸町", ja: "亀戸・錦糸町", matchTerms: ["亀戸", "錦糸町"] },
  { key: "shibuya", zh: "涩谷・中目黑", ja: "渋谷・中目黒", matchTerms: ["渋谷", "恵比寿", "中目黒", "明治神宮前", "代官山"] },
  { key: "ginza", zh: "银座・新桥", ja: "銀座・新橋", matchTerms: ["銀座", "新橋"] },
  { key: "shinokubo", zh: "大久保", ja: "大久保", matchTerms: ["大久保"] },
  { key: "yokohama", zh: "横滨中华街", ja: "横浜中華街", matchTerms: ["元町・中華街", "石川町", "日本大通り"] },
  { key: "kawasaki", zh: "川崎", ja: "川崎", matchTerms: ["川崎"] },
  { key: "asakusa", zh: "浅草", ja: "浅草", matchTerms: ["浅草"] },
  { key: "nishikawaguchi", zh: "西川口", ja: "西川口", matchTerms: ["西川口", "川口"] },
  { key: "funabashi", zh: "船桥", ja: "船橋", matchTerms: ["船橋", "大神宮下", "二和向台"] },
] as const;

export type StationArea = (typeof stationAreas)[number];
export type StationAreaKey = StationArea["key"];

export function getStationArea(key: string): StationArea | null {
  return stationAreas.find((s) => s.key === key) ?? null;
}

export function getStationAreaLabel(station: StationArea, locale: string): string {
  return locale === "zh" ? station.zh : station.ja;
}

export function matchesStationArea(nearestStation: string | null | undefined, station: StationArea): boolean {
  if (!nearestStation) return false;
  return station.matchTerms.some((term) => nearestStation.includes(term));
}

export function buildStationAreaSqlClause(stationKey: string): { condition: string; binds: string[] } | null {
  const station = getStationArea(stationKey);
  if (!station) return null;
  const conditions = station.matchTerms.map(() => "nearest_station LIKE ?");
  const binds = station.matchTerms.map((term) => `%${term}%`);
  return {
    condition: `(${conditions.join(" OR ")})`,
    binds,
  };
}

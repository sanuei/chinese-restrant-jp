export const stationAreas = [
  { key: "ikebukuro", searchTerm: "池袋", zh: "池袋", ja: "池袋" },
  { key: "ueno", searchTerm: "上野", zh: "上野", ja: "上野" },
  { key: "takadanobaba", searchTerm: "高田馬場", zh: "高田马场", ja: "高田馬場" },
  { key: "shinkoiwa", searchTerm: "新小岩", zh: "新小岩", ja: "新小岩" },
  { key: "shinokubo", searchTerm: "新大久保", zh: "新大久保", ja: "新大久保" },
  { key: "kameido", searchTerm: "亀戸", zh: "龟户", ja: "亀戸" },
  { key: "shinjuku", searchTerm: "新宿", zh: "新宿", ja: "新宿" },
  { key: "akihabara", searchTerm: "秋葉原", zh: "秋叶原", ja: "秋葉原" },
] as const;

export type StationAreaKey = (typeof stationAreas)[number]["key"];

-- 餐厅浏览量统计（首页热度排行榜的数据源）
-- 按「餐厅 + 日期」聚合，而不是一次浏览一行：
--   1. 行数可控（餐厅数 × 天数），D1 查询便宜
--   2. 方便做「最近 N 天」的滚动榜，老数据可以直接按日期清理
CREATE TABLE IF NOT EXISTS restaurant_views (
  restaurant_id TEXT NOT NULL,
  view_date TEXT NOT NULL,              -- YYYY-MM-DD（UTC）
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, view_date)
);

-- 排行榜按日期范围过滤后再聚合，这个索引覆盖 WHERE view_date >= ?
CREATE INDEX IF NOT EXISTS idx_restaurant_views_date ON restaurant_views(view_date);

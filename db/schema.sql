-- ガチ中華ナビ D1 数据库 Schema
-- 适用于 Cloudflare D1 (SQLite)

-- 餐厅主表
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,                    -- Google place_id
  name_zh TEXT NOT NULL DEFAULT '',       -- 中文名称
  name_ja TEXT NOT NULL DEFAULT '',       -- 日文名称
  name_original TEXT NOT NULL,            -- 原始名称（来自 Google Maps）
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'tokyo',
  ward TEXT,                              -- 区（新宿区、渋谷区 等）
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  phone TEXT,
  website TEXT,
  google_maps_url TEXT,
  price_level INTEGER DEFAULT 2,          -- 1-4（$ ~ $$$$）
  value_score INTEGER,                    -- 性价比 0-100
  cuisine_type TEXT DEFAULT 'other',      -- sichuan/cantonese/northern/fujian/hunan/jiangsu/northwest/yunnan/other
  cuisine_confidence INTEGER DEFAULT 0,   -- AI菜系判断置信度 0-100
  authenticity TEXT DEFAULT 'unknown',    -- authentic / adapted / japanese / unknown
  authenticity_score INTEGER DEFAULT 0,   -- AI正宗度分数 0-100
  authenticity_reason_zh TEXT,            -- 正宗度判断理由（中文）
  authenticity_reason_ja TEXT,            -- 正宗度判断理由（日文）
  raw_rating REAL DEFAULT 0,              -- Google 原始评分
  trusted_rating REAL DEFAULT 0,          -- AI 可信加权评分
  raw_review_count INTEGER DEFAULT 0,     -- Google 原始评论数
  trusted_review_count INTEGER DEFAULT 0, -- 过滤后真实评论数
  ai_summary_zh TEXT,                     -- AI 中文摘要（JSON）
  ai_summary_ja TEXT,                     -- AI 日文摘要（JSON）
  name_zh_search TEXT,                    -- 简繁归一化搜索影子字段
  name_ja_search TEXT,
  name_original_search TEXT,
  address_search TEXT,
  ward_search TEXT,
  ai_summary_zh_search TEXT,
  ai_summary_ja_search TEXT,
  authenticity_reason_zh_search TEXT,
  authenticity_reason_ja_search TEXT,
  ai_summary_updated_at TEXT,
  opening_hours TEXT,                     -- JSON 格式营业时间
  photos TEXT,                            -- JSON 格式照片 URL 列表
  is_active INTEGER DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 评论表
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,                    -- Google review ID
  restaurant_id TEXT NOT NULL,
  author_name TEXT,
  author_photo_url TEXT,
  rating INTEGER NOT NULL,               -- 1-5
  text TEXT,
  language TEXT DEFAULT 'ja',            -- zh / ja / en / other
  published_at TEXT,
  credibility_score INTEGER DEFAULT 50,  -- AI 可信度 0-100
  credibility_action TEXT DEFAULT 'keep', -- keep / flag / remove
  credibility_reason TEXT,               -- AI 判断原因
  source TEXT DEFAULT 'google',          -- google / platform（用户自写）
  user_id TEXT,                          -- 平台用户写的评论关联用户
  helpful_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);

-- 平台用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  preferred_lang TEXT DEFAULT 'zh',      -- zh / ja
  created_at TEXT DEFAULT (datetime('now'))
);

-- 用户收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, restaurant_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);

-- 全文搜索虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS restaurants_fts USING fts5(
  id UNINDEXED,
  name_zh,
  name_ja,
  name_original,
  address,
  ward,
  cuisine_type,
  content=restaurants,
  content_rowid=rowid
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants(city);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_authenticity ON restaurants(authenticity);
CREATE INDEX IF NOT EXISTS idx_restaurants_trusted_rating ON restaurants(trusted_rating DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_credibility ON reviews(credibility_action);

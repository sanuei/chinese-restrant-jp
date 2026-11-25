-- 在日华人生活专区：门店表 + 社区打分/留言/点赞表
CREATE TABLE IF NOT EXISTS life_places (
  id TEXT PRIMARY KEY,
  name_zh TEXT,
  name_ja TEXT,
  name_original TEXT NOT NULL,
  category TEXT NOT NULL,                -- hair | medical | fitness | massage | beauty | entertainment | housing | services
  chinese_support TEXT NOT NULL DEFAULT 'bilingual', -- native | bilingual | friendly
  address TEXT NOT NULL,
  city TEXT,
  ward TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  nearest_station TEXT,
  nearest_station_zh TEXT,
  station_distance_m INTEGER,
  phone TEXT,
  website TEXT,
  google_maps_url TEXT,
  price_level INTEGER,
  rating REAL,
  review_count INTEGER DEFAULT 0,
  summary_zh TEXT,
  summary_ja TEXT,
  tags_zh TEXT,                          -- JSON 数组
  tags_ja TEXT,                          -- JSON 数组
  opening_hours TEXT,                    -- JSON 对象（与 restaurants 相同格式）
  photos TEXT,                           -- JSON 数组（photo_reference 或 URL）
  business_status TEXT DEFAULT 'OPERATIONAL',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_life_places_cat_active ON life_places(category, is_active, rating DESC);
CREATE INDEX IF NOT EXISTS idx_life_places_station ON life_places(nearest_station);

-- 生活专区用户打分表
CREATE TABLE IF NOT EXISTS life_place_ratings (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(place_id, user_id),
  FOREIGN KEY(place_id) REFERENCES life_places(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_life_ratings_place ON life_place_ratings(place_id);

-- 生活专区用户留言与楼中楼讨论表
CREATE TABLE IF NOT EXISTS life_place_comments (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  parent_id TEXT,
  reply_to_name TEXT,
  rating INTEGER,
  content TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(place_id) REFERENCES life_places(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_life_comments_place ON life_place_comments(place_id, is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_life_comments_user_time ON life_place_comments(user_id, created_at DESC);

-- 生活专区评论点赞表
CREATE TABLE IF NOT EXISTS life_comment_likes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id)
);

-- 餐厅社区互动表：用户打分、留言讨论（含楼中楼回复）与点赞
CREATE TABLE IF NOT EXISTS restaurant_ratings (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(restaurant_id, user_id),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_ratings_rest ON restaurant_ratings(restaurant_id);

CREATE TABLE IF NOT EXISTS restaurant_comments (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
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
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_restaurant ON restaurant_comments(restaurant_id, is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_time ON restaurant_comments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id)
);

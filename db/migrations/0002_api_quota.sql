-- Google API 调用配额计数器（硬性止损）
--
-- 用 D1 而不是 KV：KV 的读写是最终一致的，高并发下计数会漂移，
-- 可能在额度用完后还多打几百次 Google。D1 是强一致的，
-- 而且 SQLite 的条件 UPSERT 能把「检查额度」和「加一」做成一个原子操作。
CREATE TABLE IF NOT EXISTS api_quota (
  api TEXT NOT NULL,                    -- photo / details / textsearch / nearbysearch
  period TEXT NOT NULL,                 -- YYYY-MM（UTC），按自然月重置
  used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (api, period)
);

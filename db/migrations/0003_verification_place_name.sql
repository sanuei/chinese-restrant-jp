-- 鉴定记录直接存店名。
-- 原本店名只存在 evidence_json 里，而那个字段塞了完整评论正文，
-- 公开列表每次渲染都去 JSON.parse 20 条太浪费 CPU（Workers 上 CPU 是硬约束）。
ALTER TABLE restaurant_verifications ADD COLUMN place_name TEXT;

-- 列表按时间倒序取最近若干条
CREATE INDEX IF NOT EXISTS idx_restaurant_verifications_created
  ON restaurant_verifications(created_at DESC);

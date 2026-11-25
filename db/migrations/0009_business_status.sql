-- 餐厅营业状态字段（区分正常营业 / 暂停营业 / 已停业）
-- 停业店保留页面用于明确提示「已停业 / 閉店」，避免用户白跑，同时从首页推荐/榜单中排除。
ALTER TABLE restaurants ADD COLUMN business_status TEXT DEFAULT 'OPERATIONAL';

UPDATE restaurants
SET business_status = 'CLOSED_PERMANENTLY', updated_at = datetime('now')
WHERE id = 'ChIJc66sSACPGGARAamebbJg-Iw';

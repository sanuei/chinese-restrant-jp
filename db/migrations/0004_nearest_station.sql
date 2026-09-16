-- 最近车站。
--
-- 在日本找店的心智单位是车站而不是行政区（用户想的是「池袋站附近」，
-- 不是「豊島区」）。站名和步行时间在 OSM 数据 + 经纬度上离线算出来，
-- 不依赖任何计费 API，采集时或事后批量回填都可以。
ALTER TABLE restaurants ADD COLUMN nearest_station TEXT;      -- 日文站名（汉字，中文用户也能读）
ALTER TABLE restaurants ADD COLUMN nearest_station_zh TEXT;   -- OSM 里带 name:zh 时才有
ALTER TABLE restaurants ADD COLUMN station_distance_m INTEGER;

CREATE INDEX IF NOT EXISTS idx_restaurants_station ON restaurants(nearest_station);

# 餐厅评分系统

## 评分公式

```
trusted_rating = Bayesian_Avg + authenticity_bonus + quality_penalty
```

### 1. 贝叶斯平均评分（Bayesian Average）

解决小样本偏差问题：新店用少量评论拿高分，不能直接碾压老店。

```
WR = (v / (v + m)) × R + (m / (v + m)) × C
```

| 参数 | 值 | 说明 |
|------|----|------|
| R | Google 原始评分 | 1.0 ~ 5.0 |
| v | `raw_review_count` | 该餐厅评论数 |
| m | 598 | 最小样本量（中位数），所有餐厅评论数的中位数 |
| C | 4.5000 | 全量餐厅 Google 评分均值 |

### 2. 正宗度加成（authenticity_bonus）

正宗中华料理给予额外加分，正宗度 60% 以下不加成。

```
authenticity_bonus = max(0, (authenticity_score - 60) / 100 × 0.3)
```

- `authenticity_score` = 100（完全正宗）→ +0.30 加成
- `authenticity_score` = 80 → +0.06 加成
- `authenticity_score` = 60 → +0.00（不加成）

### 3. 刷评惩罚（quality_penalty）

利用 Google 自带的评论有用票（votes）检测刷评嫌疑。

```
avg_votes = total_votes / review_count
quality_penalty = -0.2  if avg_votes < 3
quality_penalty =  0.0  otherwise
```

- 篇均 votes > 50：高质量评论堆，真实
- 篇均 votes < 3：刷评嫌疑，降低排名

---

## 参数说明

### 为什么用中位数作为 m？

m 控制"小样本向均值回归"的速度。如果用均值（约 1221），新店会被压得更低。中位数 598 更适合这个数据集的分布，让评论数在 500~1000 的餐厅有明显的排名差异。

### m 和 C 的更新策略

当新餐厅入库后，每季度重新计算一次：

```sql
-- 重新计算 m 和 C
SELECT
  AVG(raw_rating) as C,          -- 4.5000
  (SELECT raw_review_count FROM restaurants ORDER BY raw_review_count LIMIT 1 OFFSET COUNT(*)/2) as m  -- 598
FROM restaurants;
```

---

## 计算示例

| 餐厅 | R | v | WR | auth_score | bonus | penalty | trusted_rating |
|------|---|---|----|-----------|-------|---------|----------------|
| 湘聚・湖南菜館 | 4.8 | 2033 | 4.732 | 90 | +0.09 | 0 | **4.822** |
| 某正宗川菜老店 | 4.3 | 500 | 4.394 | 85 | +0.075 | 0 | **4.469** |
| 某新店 | 4.8 | 50 | 4.531 | 50 | 0 | 0 | **4.531** |
| 某刷评嫌疑店 | 4.5 | 800 | 4.480 | 60 | 0 | -0.2 | **4.280** |

---

## 数据存储

`trusted_rating` 存储在 `restaurants.trusted_rating` 字段。

每次 `/api/admin/sync` 采集完成后，重新计算并更新：

```sql
UPDATE restaurants
SET trusted_rating = :trusted_rating,
    updated_at = datetime('now')
WHERE id = :restaurant_id;
```

---

## 前端展示

| 分数区间 | 显示方式 |
|---------|---------|
| 4.7+ | 绿色徽章 + "推荐" |
| 4.5~4.7 | 黑色标签 |
| 4.3~4.5 | 普通显示 |
| 4.0~4.3 | 灰色 |
| < 4.0 | 默认 |

---

## 后续升级方向

1. **AI 评论可信度分析**：逐条评论打 `credibility_action`（keep/flag/remove），算 `trusted_review_count`
2. **时间衰减**：长期无新评论的餐厅逐步降低权重
3. **投票分布分析**：检测"短期内大量 5 星"的时间聚集模式
4. **评论者背景**：检测同一 IP/设备批量发表的可疑模式

# 工作日志：AI 供应商切 DeepSeek + 首页信息密度 + 品牌物料

**日期**：2026-09-17
**背景**：老板要求①切换 AI 供应商到 DeepSeek 并跑通，②首页「按品类/按车站」两块占地太大要压密度，③联系页加微信二维码、页脚加社交媒体链接，④换上新 logo

---

## 一、AI 供应商：MiniMax → DeepSeek

### 改动
| 位置 | 变化 |
|---|---|
| `src/lib/minimax.ts` | 删除，换成 `src/lib/deepseek.ts` |
| `src/lib/restaurant-sync.ts` | import 指向新模块，日志前缀改 DeepSeek |
| `src/lib/deepseek.ts` | 端点 `/chat/completions`（OpenAI 兼容），模型 `deepseek-flash`（可用 env `DEEPSEEK_MODEL` 覆盖） |
| `scripts/repair-ai-analysis.mjs` / `scripts/fill-chinese-names.mjs` | 同样切到 DeepSeek 端点与模型 |
| `src/env.d.ts` | `MINIMAX_API_KEY/BASE` → `DEEPSEEK_API_KEY/BASE/MODEL` |
| 隐私政策（中/日） | 第三方服务说明里的供应商名字改成 DeepSeek |
| Cloudflare secret | 新增 `DEEPSEEK_API_KEY`（旧的 MINIMAX_* 暂留未删） |

### 关键坑：DeepSeek 的思考模式会把正文预算吃光
`deepseek-flash` / `deepseek-v4-pro` 默认开思考模式，思考过程写在 `message.reasoning_content`，
并且**和正文共享 `max_tokens`**。本站的 prompt（一次判断菜系+品类+正宗度+双语摘要+多条评论可信度）
实测思考就能吃掉 400+ token，结果：

```
finish_reason=length, completion_tokens=400, reasoning_tokens=400, content=""
```

即「HTTP 200 但正文是空的」，MiniMax 那套解析逻辑会把它误报成「不是合法 JSON」。
对策是显式传 `thinking: { type: "disabled" }`（DeepSeek 接受这个参数，实测生效），
另外正文为空时自动加大预算重试一次，仍为空就抛出带 `reasoning_tokens` 的诊断信息，
不再让它伪装成 JSON 解析失败。

### 验证
- 真实调用 `analyzeRestaurantSnapshot`：菜系 cantonese / 品类 dimsum / 正宗度 authentic 判定正确，
  3 条评论全部给出可信度，无字段缺失，2.3s。
- 跑 `scripts/fill-chinese-names.mjs`（真连远端 D1）：3 家待补店名全部转换成功。
- `tsc --noEmit` 0 错误，eslint 0 error。
- 部署后打生产 `POST /api/verify`（用已有店的 place_id）：HTTP 200，
  `cuisine_type=northwest`、`verdict=gachi`、4 条评论全部打分，全链路（Google → DeepSeek → D1）通。

---

## 二、首页信息密度

「按品类找餐厅」（9 格）和「按车站找餐厅」（8 格）原本各占一个 `py-12` section + 两条分隔线，
首屏基本被吃光。

- 合并成 `src/components/HomeDiscovery.tsx`：一个标题位 + 右上角切换按钮（按品类 / 按车站），
  卡片区共用一格高度。
- 切换用**隐藏 radio + `:checked` 兄弟选择器**（CSS 写在 `globals.css` 的 `.discovery-tabs`），
  不引入 client component —— 站点在 Workers 上跑，CPU/JS 是硬约束。
  键盘可用（原生 radio 方向键切换），焦点环用 `:focus-visible` 给。
- 卡片压缩：品类卡 `px-1.5 py-2.5` + 图标 22（原 28）；车站卡从竖版 `min-h-28` 改成
  「图标 + 站名 + 家数」横条，高度约减半。
- 全站模块间距收紧：`divider-chinese` margin 32 → 18px，各 section `py-12` → `py-8`，
  标题 `mb-8` → `mb-5`，页脚 `mt-20` → `mt-14`。
- `DishTypeGrid` / `StationGrid` 拆出 `DishTypeCardGrid` / `StationCardGrid` 供两处复用
  （`/cuisines` 页面仍用带标题的默认导出）。

---

## 三、品牌物料与联系入口

- 联系页新增「微信联系与打赏」区块：两张卡片分别放加好友码和微信收款码，
  图片从 `docs/图片/` 转成 webp（lossless，720px 宽）放到 `public/contact/`，
  **用 lossless 是为了保证二维码扫码率**，别为了几十 KB 换成有损。
- 页脚加 Instagram / X / YouTube 链接。lucide-react v1 **没有** Instagram/YouTube 等品牌图标，
  所以 `src/components/SocialLinks.tsx` 里用基础图形自己画（描边风格和站点其它图标一致），
  不引第三方图标包。
- 新 logo：`public/brand/zhenwei-logo-mark*.png`（透明底）。旧的灶台造型
  `src/app/icon.svg` + `src/app/apple-icon.tsx` 已删，换成从 1254px 母版裁切居中的
  `src/app/icon.png`(192) 和 `src/app/apple-icon.png`(180, 白底)，`public/favicon.ico`
 重新生成 16/32/48 三档。Navbar / Footer 改用 PNG。

---

## 待办

- [ ] Cloudflare 上的 `MINIMAX_API_KEY` / `MINIMAX_API_BASE` 两个 secret 已无代码引用，确认不再需要后可删
- [ ] DeepSeek 账户余额持续观察（切供应商当天 ¥8.35）
- [ ] 首页合并模块在窄屏（<640px）下的切换按钮位置需要真机再看一眼

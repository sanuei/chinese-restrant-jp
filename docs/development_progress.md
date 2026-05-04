# ガチ中華ナビ 开发进度追踪

## 阶段 0：准备工作 (✅ 已完成)
- [x] 创建 `.env.local` 环境变量（API Keys）
- [x] 配置 `.gitignore` 防止密钥泄露
- [x] 初始化 git 仓库，推送 GitHub
- [x] 初始化 Next.js 15 项目
- [x] 配置 Cloudflare Pages + OpenNext
- [x] 初始化 Tailwind CSS + shadcn/ui 组件库
- [x] 规划 D1 数据库 Schema
- [x] 在本地成功初始化 D1 SQLite 数据库
- [x] 配置 KV Namespace（用于缓存）

## 阶段 1：前端 UI (✅ 已完成)
- [x] 建立专属设计系统（颜色、字体、UI 规范）
- [x] 搭建跨语种 Navbar 组件
- [x] 首页 Hero 区域设计
- [x] 菜系展示网格（CuisineGrid）
- [x] 热门餐厅组件展示
- [x] 实现 `next-intl` 双语切换（/zh 和 /ja 路由）
- [x] 认证徽章与菜系标签样式

## 阶段 2：核心数据层 (🚧 进行中)
- [x] Google Maps Places API 封装（获取餐厅基本信息与评论）
- [x] MiniMax 接入：评论可信度分析模型
- [x] MiniMax 接入：菜系自动分类逻辑
- [x] MiniMax 接入：双语自动摘要生成
- [x] AI 综合：正宗度自动判断与评分计算
- [x] 开发 `/api/admin/sync` 增量采集数据接口
- [x] 将获取与分析后的数据写入 D1 数据库

## 阶段 3：业务逻辑与页面数据绑定 (✅ 基础版已完成)
- [x] 餐厅列表页（从 D1 数据库查询数据、搜索、过滤）
- [x] 餐厅详情页（展示 AI 摘要、过滤后评论、详细评分）
- [x] 地图全景视图（整合 Google Maps JS API）
- [x] 菜系导航接入餐厅列表筛选
- [x] Cloudflare Workers + OpenNext 首次部署上线

## 阶段 4：后续升级与商业化准备 (未开始)
- [ ] 引入第三方评论抓取服务（SerpAPI 等）突破 5 条评论限制
- [ ] 用户系统集成（供用户自行发布评论与收藏）
- [ ] 自定义域名、SEO 优化与正式发布前检查

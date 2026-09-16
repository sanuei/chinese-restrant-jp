import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig(),
  // Cloudflare Workers Builds 面板里的构建命令固定是 `npm run build`，
  // 而 wrangler.toml 的 main 指向 .open-next/worker.js —— 纯 next build 不产出它，
  // 所以 build 必须走 OpenNext。但 OpenNext 内部又会执行项目的 `npm run build`
  // 来构建 Next.js，于是 build -> opennext -> build 形成无限递归。
  // 这里显式指定它去跑 build:next（纯 next build），把环打断。
  buildCommand: "npm run build:next",
};

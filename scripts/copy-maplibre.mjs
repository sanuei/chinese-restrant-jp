// 把 maplibre-gl 的官方 ESM 产物原样复制到 public/。
//
// 为什么不直接让 webpack 打包：maplibre v6 的 Web Worker 是独立文件，
// 靠 `new URL("./maplibre-gl-worker.mjs", import.meta.url)` 定位。
// 被 webpack 打包后 import.meta.url 变成 /_next/static/chunks/xxx.js，
// 而 webpack 不会把 worker 输出到那里 —— 请求落到 404 页面拿回 HTML，
// worker 起不来，地图样式永远 load 不完，页面就卡在「地图加载中」。
//
// 原样放在 public/ 下三个文件挨在一起，相对解析自然就对了，
// 也不会出现「webpack 打一份 + worker 再拉一份」的重复下载。
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public");

const files = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];

await mkdir(to, { recursive: true });
for (const file of files) {
  await copyFile(join(from, file), join(to, file));
  console.log(`[maplibre] copied ${file}`);
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "真味中华 | ガチ中華ナビ",
    short_name: "真味中华",
    description: "AI 驱动的在日中国餐厅评鉴平台",
    start_url: "/zh",
    display: "standalone",
    background_color: "#fdf6ec",
    theme_color: "#7a2118",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}

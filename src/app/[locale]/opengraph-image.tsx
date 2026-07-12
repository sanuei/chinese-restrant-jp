import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "真味中华 / ガチ中華ナビ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isZh = locale === "zh";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background: "linear-gradient(135deg, #1a0f0d 0%, #2b1310 45%, #4a1d16 100%)",
          color: "#fdf6ec",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#e5c36a",
            marginBottom: 28,
          }}
        >
          AI VERIFIED CHINESE RESTAURANT GUIDE
        </div>
        <div style={{ display: "flex", fontSize: 108, fontWeight: 900, lineHeight: 1 }}>
          {isZh ? "真味中华" : "ガチ中華ナビ"}
        </div>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#e5c36a", marginTop: 24 }}>
          {isZh ? "东京与关东的真实中国味评鉴" : "東京と関東の本格中華を見極める"}
        </div>
      </div>
    ),
    { ...size }
  );
}

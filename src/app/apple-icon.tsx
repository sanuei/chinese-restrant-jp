import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// 配色和构图跟 icon.svg（灶台雾气造型）保持一致，只是换成 apple-touch-icon 需要的实心背景 PNG
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff8f0",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
          <path d="M14 34c1.8 10.5 9.1 17 18 17s16.2-6.5 18-17H14Z" fill="#b4001e" />
          <path d="M18 34h28c-2.2 5.9-7.5 9.4-14 9.4S20.2 39.9 18 34Z" fill="#f7c948" />
          <path d="M13 30h38" stroke="#2e211b" strokeWidth="4" strokeLinecap="round" />
          <path
            d="M23 19c-2.2-3.8 2.4-5.5 0-9M33 20c-2.4-4.1 2.8-5.8.4-9.5M43 19c-2.2-3.8 2.4-5.5 0-9"
            stroke="#b4001e"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}

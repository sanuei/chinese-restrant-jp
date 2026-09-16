"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

type Props = {
  title: string;
  text?: string;
  locale: string;
  className?: string;
};

/**
 * 分享按钮。
 *
 * 站点流量主要来自 Threads / Instagram 的站内浏览器，用户是「看到好店想转给朋友」
 * 的场景，但之前没有任何分享入口。
 *
 * 优先用系统原生分享面板（手机上能直接唤起微信/LINE/Threads），
 * 不支持时退回复制链接 —— 桌面浏览器和部分站内浏览器没有 navigator.share。
 */
export default function ShareButton({ title, text, locale, className }: Props) {
  const [copied, setCopied] = useState(false);
  const isZh = locale === "zh";
  const label = isZh ? "分享" : "シェア";
  const copiedLabel = isZh ? "链接已复制" : "リンクをコピーしました";

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url });
        return;
      } catch {
        // 用户取消分享会走到这里，不该再退回复制，直接结束
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用（非 HTTPS 或权限被拒）时最后的兜底
      window.prompt(isZh ? "复制这个链接：" : "このリンクをコピー:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={label}
      title={copied ? copiedLabel : label}
      className={
        className ||
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-warm-200 text-ink-700 transition-colors hover:border-vermilion-700 hover:text-vermilion-700"
      }
    >
      {copied ? <Check size={17} className="text-vermilion-700" /> : <Share2 size={17} />}
    </button>
  );
}

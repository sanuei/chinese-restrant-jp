"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

export type HeroArcCardItem = {
  key: string;
  href: string;
  photo: string;
  name: string;
  cuisineLabel: string;
  rating: number | null;
};

type Props = {
  cards: HeroArcCardItem[];
  locale: string;
};

/** 将索引差值折返到 [-n/2, n/2) 区间，实现无限环形滑动 */
function wrapDelta(index: number, offset: number, total: number): number {
  let d = (index - offset) % total;
  if (d > total / 2) d -= total;
  if (d <= -total / 2) d += total;
  return d;
}

/**
 * 计算单张卡片在 3D 内凹弧幕上的几何变换与视觉滤镜。
 * 中心卡片收在景深焦点处，越往左右两侧旋转角度越大、前倾越明显、放大越夸张。
 */
function computeCardVisual(d: number, baseW: number, isMobile: boolean) {
  const absD = Math.abs(d);
  const visible = absD <= (isMobile ? 2.6 : 3.7);

  if (!visible) {
    return {
      transform: `translate3d(${d > 0 ? 1600 : -1600}px, 0, -200px) scale(0.5)`,
      opacity: 0,
      zIndex: 1,
      filter: "none",
      pointerEvents: "none" as const,
      isCenter: false,
    };
  }

  const d2 = d * d;
  // 移动端温和一些，桌面端两侧放大与内凹前倾更夸张震撼
  const scale = isMobile
    ? 0.92 + 0.03 * d2
    : 0.82 + 0.08 * d2;
  const rotateY = isMobile
    ? -d * 10
    : -d * 15.5;
  const translateZ = isMobile
    ? -20 + 12 * d2
    : -56 + 24 * d2;
  const translateX = isMobile
    ? d * baseW * 1.08
    : d * baseW * (0.86 + 0.033 * d2);

  // 边缘平滑淡出，防止突然闪现
  const fadeStart = isMobile ? 1.8 : 3.05;
  const fadeEnd = isMobile ? 2.55 : 3.65;
  const opacity = absD <= fadeStart
    ? 1
    : Math.max(0, 1 - (absD - fadeStart) / (fadeEnd - fadeStart));

  // 中央光束左侧渐变冷调低饱和，右侧保持饱满美食原色
  let filter = "none";
  if (!isMobile && d < -0.18) {
    const ratio = Math.min(1, (-d - 0.18) / 2.0);
    const gray = (ratio * 0.82).toFixed(2);
    const bright = (1 - ratio * 0.16).toFixed(2);
    const contrast = (1 + ratio * 0.08).toFixed(2);
    filter = `grayscale(${gray}) brightness(${bright}) contrast(${contrast})`;
  }

  // 外侧卡前倾离镜头更近，zIndex 略高；中心焦点卡在中间层级突出
  const zIndex = Math.round(10 + absD * 4);

  return {
    transform: `translate3d(${translateX.toFixed(1)}px, 0, ${translateZ.toFixed(1)}px) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
    opacity: Number(opacity.toFixed(3)),
    zIndex,
    filter,
    pointerEvents: opacity > 0.15 ? ("auto" as const) : ("none" as const),
    isCenter: absD < 0.42,
  };
}

export default function HeroArcGallery({ cards, locale }: Props) {
  const total = cards.length;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);

  // 动画状态全部放在 ref 里，通过 rAF 直接写 DOM，保持 60fps 零 React 重绘卡顿
  const offsetRef = useRef(0);
  const targetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const hoveredRef = useRef(false);
  const wheelSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metricsRef = useRef({ baseW: 210, baseH: 288, isMobile: false });

  const [layoutMetrics, setLayoutMetrics] = useState({ baseW: 210, baseH: 288, isMobile: false });
  const [isDraggingUI, setIsDraggingUI] = useState(false);

  const applyFrame = useCallback(() => {
    const { baseW, isMobile } = metricsRef.current;
    const offset = offsetRef.current;
    for (let i = 0; i < total; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const d = wrapDelta(i, offset, total);
      const vis = computeCardVisual(d, baseW, isMobile);
      el.style.transform = vis.transform;
      el.style.opacity = String(vis.opacity);
      el.style.zIndex = String(vis.zIndex);
      el.style.pointerEvents = vis.pointerEvents;
      el.dataset.center = vis.isCenter ? "1" : "0";

      const img = imgRefs.current[i];
      if (img) {
        img.style.filter = vis.filter;
      }
    }
  }, [total]);

  // 响应窗口宽度，动态计算卡片基础尺寸
  useEffect(() => {
    const updateSize = () => {
      const w = stageRef.current?.clientWidth || window.innerWidth;
      const isMobile = w < 640;
      const baseW = isMobile
        ? Math.round(Math.min(230, Math.max(176, w * 0.56)))
        : Math.round(Math.min(218, Math.max(158, w * 0.146)));
      const baseH = Math.round(baseW * 1.37);
      metricsRef.current = { baseW, baseH, isMobile };
      setLayoutMetrics({ baseW, baseH, isMobile });
      applyFrame();
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [applyFrame]);

  // 主 60fps 阻尼动画循环
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const diff = targetRef.current - offsetRef.current;
      if (Math.abs(diff) > 0.0005) {
        // 拖拽时紧跟手指，松手后柔和阻尼吸附
        const factor = isDraggingRef.current ? 0.32 : 0.11;
        offsetRef.current += diff * factor;
        applyFrame();
      }
      rafId = requestAnimationFrame(tick);
    };
    applyFrame();
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [applyFrame]);

  // 自动缓慢轮播（悬停或拖拽时暂停）
  useEffect(() => {
    const timer = setInterval(() => {
      if (isDraggingRef.current || hoveredRef.current) return;
      targetRef.current = Math.round(targetRef.current) + 1;
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  const step = useCallback((delta: number) => {
    targetRef.current = Math.round(targetRef.current) + delta;
  }, []);

  // Pointer 拖拽交互（桌面鼠标 + 手机触摸通用）
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 忽略右键或按钮点击
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button")) return;

    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = targetRef.current;
    setIsDraggingUI(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartXRef.current;
    if (Math.abs(dx) > 6) {
      dragMovedRef.current = true;
    }
    const pxPerCard = Math.max(150, metricsRef.current.baseW * 0.95);
    targetRef.current = dragStartOffsetRef.current - dx / pxPerCard;
  };

  const finishDrag = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDraggingUI(false);
    // 松手自动吸附到最近的一张卡片居中
    targetRef.current = Math.round(targetRef.current);
  };

  // 使用非 passive 原生 wheel 监听，支持触控板双指横滑且防止误触发浏览器后退手势
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 3) return;
      e.preventDefault();
      const pxPerCard = Math.max(160, metricsRef.current.baseW * 1.15);
      targetRef.current += e.deltaX / pxPerCard;

      if (wheelSnapTimerRef.current) clearTimeout(wheelSnapTimerRef.current);
      wheelSnapTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current) {
          targetRef.current = Math.round(targetRef.current);
        }
      }, 160);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelSnapTimerRef.current) clearTimeout(wheelSnapTimerRef.current);
    };
  }, []);

  const handleCardClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const prevLabel = locale === "zh" ? "上一家餐厅" : "前のレストラン";
  const nextLabel = locale === "zh" ? "下一家餐厅" : "次のレストラン";
  const dragHint = locale === "zh" ? "← 左右拖动或滑动浏览更多正宗餐厅 →" : "← 左右にドラッグ・スワイプしてもっと見る →";

  // SSR 首帧与客户端共用完全一致的初始几何，留足上下空间避免外侧大卡被裁圆角
  const stageHeight = layoutMetrics.isMobile ? layoutMetrics.baseH + 54 : Math.round(layoutMetrics.baseH * 1.66);

  return (
    <div
      ref={stageRef}
      className={`hero-arc-stage mt-6 sm:mt-8 select-none ${isDraggingUI ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ height: `${stageHeight}px` }}
      onMouseEnter={() => { hoveredRef.current = true; }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        finishDrag();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {/* 固定在舞台正中央的「AI 鉴味光束」：卡片滑过时实时从冷调切换为饱满全彩 */}
      <div className="hero-stage-beam" aria-hidden />

      {/* 3D 卡片容器 */}
      <div className="hero-arc-viewport">
        {cards.map((card, idx) => {
          const initDelta = wrapDelta(idx, 0, total);
          const initVis = computeCardVisual(initDelta, layoutMetrics.baseW, layoutMetrics.isMobile);

          return (
            <Link
              key={card.key}
              href={card.href}
              draggable={false}
              onClick={handleCardClick}
              ref={(el) => { cardRefs.current[idx] = el; }}
              data-center={initVis.isCenter ? "1" : "0"}
              className="hero-arc-card group"
              style={{
                width: `${layoutMetrics.baseW}px`,
                height: `${layoutMetrics.baseH}px`,
                transform: initVis.transform,
                opacity: initVis.opacity,
                zIndex: initVis.zIndex,
                pointerEvents: initVis.pointerEvents,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={(el) => { imgRefs.current[idx] = el; }}
                src={card.photo}
                alt={card.name}
                draggable={false}
                style={{ filter: initVis.filter }}
              />

              <div className="hero-arc-caption">
                <div className="flex items-center justify-between gap-1.5 text-[11px] text-gold-300/90">
                  <span className="truncate">{card.cuisineLabel}</span>
                  {card.rating !== null && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-white/95">
                      <Star size={11} className="fill-gold-300 text-gold-300" />
                      {card.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs font-semibold text-white/95 sm:text-[13px]">
                  {card.name}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 左右暗黑玻璃切换箭头 */}
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={prevLabel}
        className="hero-arc-nav hero-arc-nav-prev"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={nextLabel}
        className="hero-arc-nav hero-arc-nav-next"
      >
        <ChevronRight size={20} />
      </button>

      {/* 底部极轻提示 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[11px] tracking-wider text-white/35">
        {dragHint}
      </div>
    </div>
  );
}

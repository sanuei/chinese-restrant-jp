"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";

type Props = {
  restaurantId: string;
  initialFavorited: boolean;
  isLoggedIn: boolean;
  locale: string;
  className?: string;
};

export default function FavoriteButton({ restaurantId, initialFavorited, isLoggedIn, locale, className }: Props) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  const label = favorited
    ? (locale === "zh" ? "取消收藏" : "お気に入り解除")
    : (locale === "zh" ? "收藏" : "お気に入りに追加");

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isLoggedIn) {
      window.location.href = `/api/auth/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    const next = !favorited;
    setFavorited(next);

    startTransition(async () => {
      try {
        const res = await fetch("/api/favorites", {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId }),
        });
        if (!res.ok) setFavorited(!next);
      } catch {
        setFavorited(!next);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={label}
      aria-pressed={favorited}
      title={label}
      className={
        className ||
        "inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-transform hover:scale-105"
      }
    >
      <Heart
        size={18}
        className={favorited ? "fill-vermilion-700 text-vermilion-700" : "text-ink-700"}
      />
    </button>
  );
}

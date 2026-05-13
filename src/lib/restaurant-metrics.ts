import { normalizePriceLevel } from "@/lib/restaurant-types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeValueScore(
  trustedRating: number | null | undefined,
  priceLevel: number | null | undefined,
  rawReviewCount: number | null | undefined
): number {
  const rating = Number.isFinite(trustedRating) ? Number(trustedRating) : 0;
  const reviews = Math.max(0, Number(rawReviewCount) || 0);
  const normalizedPriceLevel = normalizePriceLevel(priceLevel);

  const ratingScore = clamp(((rating - 3) / 2) * 55, 0, 55);
  const priceScore = normalizedPriceLevel === 1
    ? 25
    : normalizedPriceLevel === 2
      ? 18
      : normalizedPriceLevel === 3
        ? 10
        : normalizedPriceLevel === 4
          ? 4
          : 12;
  const reviewConfidenceScore = clamp(Math.log10(reviews + 1) * 7, 0, 20);

  return Math.round(clamp(ratingScore + priceScore + reviewConfidenceScore, 0, 100));
}

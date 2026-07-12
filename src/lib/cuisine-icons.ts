import {
  Beef,
  ChefHat,
  CookingPot,
  Fish,
  Flame,
  LeafyGreen,
  Mountain,
  Shrimp,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { CuisineType } from "@/lib/restaurant-types";

// 菜系图标映射（lucide-react，取代原来的 emoji）
export const CUISINE_ICONS: Record<CuisineType, LucideIcon> = {
  sichuan: Flame,
  cantonese: Shrimp,
  northern: Wheat,
  fujian: Fish,
  hunan: LeafyGreen,
  jiangsu: CookingPot,
  northwest: Beef,
  yunnan: Mountain,
  other: UtensilsCrossed,
};

// 品牌 logo 图标（Navbar/Footer），和菜系图标区分开
export const BRAND_ICON = ChefHat;

import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Dumbbell,
  HeartPulse,
  Mic2,
  Scissors,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import type { LifeCategory } from "@/lib/life-types";

/** 生活专区 8 大分类对应图标 */
export const LIFE_CATEGORY_ICONS: Record<LifeCategory, LucideIcon> = {
  hair: Scissors,
  medical: Stethoscope,
  fitness: Dumbbell,
  massage: HeartPulse,
  beauty: Sparkles,
  entertainment: Mic2,
  housing: Building2,
  services: Briefcase,
};

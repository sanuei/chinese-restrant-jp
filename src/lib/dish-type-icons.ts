import {
  Coffee,
  Drumstick,
  Fish,
  Flame,
  HandPlatter,
  Salad,
  Sandwich,
  Soup,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { DishType } from "@/lib/restaurant-types";

// 品类图标映射（和菜系是平行的第二套分类，图标可能与菜系重复，但网格不同不影响识别）
export const DISH_TYPE_ICONS: Record<DishType, LucideIcon> = {
  hotpot: Soup,
  bbq: Drumstick,
  noodles: Wheat,
  malatang: Flame,
  dumpling: Sandwich,
  riceNoodle: Salad,
  grilledFish: Fish,
  dimsum: Coffee,
  other: HandPlatter,
};

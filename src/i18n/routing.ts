import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh", "ja"],
  defaultLocale: "zh",
  localePrefix: "always",
  // 不根据浏览器 Accept-Language 自动跳转语言版本，网站默认就是中文
  localeDetection: false,
});

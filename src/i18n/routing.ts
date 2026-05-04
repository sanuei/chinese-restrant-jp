import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh", "ja"],
  defaultLocale: "zh",
  localePrefix: "always",
});

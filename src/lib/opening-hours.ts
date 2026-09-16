/**
 * 营业时间解析。
 *
 * 「现在还开着吗」是找餐厅时的第一问题，所以这里的重点是算出当下的营业状态，
 * 而不只是把 Google 的文字原样列出来。
 *
 * 存进 D1 的是 Google Place Details 的 periods + weekday_text。
 * 刻意不存 open_now —— 那是拉取那一刻的快照，存下来必然过期并误导用户。
 */

export type OpeningPeriod = {
  open?: { day: number; time: string }; // day: 0=周日，time: "HHMM"
  close?: { day: number; time: string };
};

export type OpeningHours = {
  periods: OpeningPeriod[];
  weekday_text: string[];
};

export type OpenState = {
  status: "open" | "closed" | "unknown";
  /** 营业中时是本段的结束时间，打烊时是下一次开门时间，形如 "22:30" */
  until: string | null;
};

export function parseOpeningHours(raw: string | null | undefined): OpeningHours | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OpeningHours;
    if (!parsed || !Array.isArray(parsed.periods)) return null;
    return { periods: parsed.periods, weekday_text: parsed.weekday_text || [] };
  } catch {
    return null;
  }
}

/** 当前的东京时间，返回 [星期(0=周日), 距当天 0 点的分钟数] */
function nowInTokyo(): [number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = Math.max(0, days.indexOf(get("weekday")));
  // Intl 在 hour12:false 下午夜可能给出 "24"
  const hour = Number(get("hour")) % 24;
  return [day, hour * 60 + Number(get("minute"))];
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
const fmt = (hhmm: string) => `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;

export function getOpenState(hours: OpeningHours | null): OpenState {
  if (!hours || hours.periods.length === 0) return { status: "unknown", until: null };

  // Google 用「只有 open、day=0、time=0000」表示 24 小时营业
  if (hours.periods.length === 1 && hours.periods[0].open?.time === "0000" && !hours.periods[0].close) {
    return { status: "open", until: null };
  }

  const [today, minutes] = nowInTokyo();

  for (const period of hours.periods) {
    if (!period.open || !period.close) continue;
    const openDay = period.open.day;
    const openMin = toMinutes(period.open.time);
    const closeMin = toMinutes(period.close.time);
    const overnight = period.close.day !== openDay;

    if (!overnight) {
      if (openDay === today && minutes >= openMin && minutes < closeMin) {
        return { status: "open", until: fmt(period.close.time) };
      }
    } else {
      // 跨夜：今天开门后到午夜，或昨天开门延续到今天凌晨
      if (openDay === today && minutes >= openMin) {
        return { status: "open", until: fmt(period.close.time) };
      }
      if ((openDay + 1) % 7 === today && minutes < closeMin) {
        return { status: "open", until: fmt(period.close.time) };
      }
    }
  }

  // 没在营业：找出下一次开门时间
  for (let ahead = 0; ahead < 7; ahead++) {
    const day = (today + ahead) % 7;
    const candidates = hours.periods
      .filter((p) => p.open?.day === day)
      .map((p) => p.open!.time)
      .filter((t) => ahead > 0 || toMinutes(t) > minutes)
      .sort();
    if (candidates.length > 0) return { status: "closed", until: fmt(candidates[0]) };
  }

  return { status: "closed", until: null };
}

/** 今天这一行的营业时间文字（weekday_text 里 0 是周一，和 periods 的 0=周日不同） */
export function getTodayText(hours: OpeningHours | null): string | null {
  if (!hours || hours.weekday_text.length !== 7) return null;
  const [day] = nowInTokyo();
  return hours.weekday_text[(day + 6) % 7] || null;
}

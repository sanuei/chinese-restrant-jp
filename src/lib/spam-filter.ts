/**
 * 留言与讨论垃圾内容过滤器（零人工审核场景下的第一道防线）
 *
 * 拦截维度：
 *   1. 蜜罐字段检测（防自动化脚本批量提交）
 *   2. 长度、纯符号/纯数字/重复刷屏与极低信息熵检测
 *   3. 外链 URL、域名、微信号/Line/Telegram/手机等广告引流拦截
 *   4. 灰黑产关键词与极端辱骂词拦截（中/日/英）
 */

export type SpamCheckResult =
  | { ok: true; cleaned: string }
  | { ok: false; code: string; messageZh: string; messageJa: string };

// URL / 裸域名拦截（排除正常小数如 4.5）
const URL_REGEX =
  /(?:https?:\/\/|www\.|t\.me\/|line\.me\/|wa\.me\/|bit\.ly\/|tinyurl\.com\/|[a-z0-9-]{2,}\.(?:com|cn|net|org|jp|cc|xyz|top|vip|shop|site|io|me|tw|hk)(?:\/|\b))/i;

// 社交引流 / 联系方式诱导（微信号、Line ID、电报、QQ、手机号等）
const CONTACT_SOLICIT_REGEX =
  /(?:加\s*(?:我|个|下)?\s*(?:微信|微|v|vx|wx|威信|维信|扣扣|qq|line|飞机|电报)|(?:微信|vx|wx|v信|line\s*id|telegram|whatsapp|qq)\s*[:：号]?\s*[a-z0-9_-]{4,}|(?:^|[^\d])(?:1[3-9]\d{9}|0[789]0-?\d{4}-?\d{4})(?:[^\d]|$))/i;

// 灰黑产 / 垃圾推广关键词（中/日/英）
const SPAM_KEYWORDS_REGEX =
  /(?:刷单|兼职日结|高薪招聘|代开发票|办假证|办证刻章|博彩|线上赌场|棋牌代理|色情视频|裸聊|约炮|上门服务|招嫖|网贷|无抵押贷款|套现|代孕|迷药|枪支|币圈带单|稳赚不赔|免費領取|稼げる副業|裏バイト|闇バイト|パパ活|援交|アダルトサイト|casino\s*bonus|crypto\s*signal|whatsapp\s*me)/i;

// 极端人身攻击 / 脏话词
const ABUSE_REGEX =
  /(?:操你妈|草泥马|肏你妈|傻逼|煞笔|妈卖批|你妈死了|nmsl|死全家|滚出去|支那|しね|死ね|くたばれ|ゴミ野郎|fuck\s*you|motherfucker)/i;

// 单字符连续重复 >= 8 次（如 aaaaaaaa / 11111111 / 哈哈哈哈哈哈哈哈）
const REPEATED_CHAR_REGEX = /(.)\1{7,}/u;

// 归一化文本用于检测重复刷屏（去掉空格与标点、转小写）
export function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

export function checkCommentSpam(input: {
  content: unknown;
  honeypot?: unknown;
  isReply?: boolean;
}): SpamCheckResult {
  // 1. 蜜罐字段被填写，直接判定机器人
  if (typeof input.honeypot === "string" && input.honeypot.trim().length > 0) {
    return {
      ok: false,
      code: "honeypot",
      messageZh: "提交异常，请稍后再试。",
      messageJa: "送信エラーが発生しました。しばらくしてから再度お試しください。",
    };
  }

  if (typeof input.content !== "string") {
    return {
      ok: false,
      code: "empty",
      messageZh: "请输入留言内容。",
      messageJa: "コメント内容を入力してください。",
    };
  }

  // 合并多余空行并去除首尾空白
  const cleaned = input.content
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const maxLen = input.isReply ? 500 : 800;
  const charCount = [...cleaned].length;

  if (charCount < 2) {
    return {
      ok: false,
      code: "too_short",
      messageZh: "留言内容太短，请至少输入 2 个字。",
      messageJa: "コメントが短すぎます（2文字以上入力してください）。",
    };
  }

  if (charCount > maxLen) {
    return {
      ok: false,
      code: "too_long",
      messageZh: `留言内容不能超过 ${maxLen} 字。`,
      messageJa: `コメントは${maxLen}文字以内で入力してください。`,
    };
  }

  // 2. 纯符号、纯表情或纯数字拦截
  const meaningful = cleaned.replace(/[\s\p{P}\p{S}]+/gu, "");
  if ([...meaningful].length < 2 || /^\d+$/.test(meaningful)) {
    return {
      ok: false,
      code: "meaningless",
      messageZh: "请输入有意义的文字内容，不要只发符号或数字。",
      messageJa: "記号や数字のみの投稿はできません。",
    };
  }

  // 3. 连续重复字符或长文本低熵刷屏检测
  if (REPEATED_CHAR_REGEX.test(cleaned)) {
    return {
      ok: false,
      code: "repeated",
      messageZh: "检测到大量重复字符，请正常输入内容。",
      messageJa: "同じ文字の連続入力が検出されました。内容を見直してください。",
    };
  }

  const meaningfulChars = [...meaningful.toLowerCase()];
  if (meaningfulChars.length >= 24) {
    const uniqueRatio = new Set(meaningfulChars).size / meaningfulChars.length;
    if (uniqueRatio < 0.14) {
      return {
        ok: false,
        code: "low_entropy",
        messageZh: "疑似无意义刷屏内容，已被系统过滤。",
        messageJa: "スパムと判定されたため投稿できませんでした。",
      };
    }
  }

  // 4. 外链与域名过滤
  if (URL_REGEX.test(cleaned)) {
    return {
      ok: false,
      code: "url_blocked",
      messageZh: "为防止垃圾广告，留言中不允许包含网址或外部链接。",
      messageJa: "スパム防止のため、URLや外部リンクを含む投稿はできません。",
    };
  }

  // 5. 微信/Line/手机号等广告引流过滤
  if (CONTACT_SOLICIT_REGEX.test(cleaned)) {
    return {
      ok: false,
      code: "contact_blocked",
      messageZh: "为防止广告引流，请勿在留言中留微信号、Line 或手机号等联系方式。",
      messageJa: "スパム・勧誘防止のため、連絡先やIDの記載はご遠慮ください。",
    };
  }

  // 6. 垃圾推广关键词
  if (SPAM_KEYWORDS_REGEX.test(cleaned)) {
    return {
      ok: false,
      code: "spam_keyword",
      messageZh: "内容命中垃圾广告过滤规则，无法发布。",
      messageJa: "スパム・宣伝と判定されたため投稿できませんでした。",
    };
  }

  // 7. 极端辱骂词过滤
  if (ABUSE_REGEX.test(cleaned)) {
    return {
      ok: false,
      code: "abuse_blocked",
      messageZh: "请文明交流，避免使用人身攻击或侮辱性用语。",
      messageJa: "不適切な表現が含まれているため投稿できませんでした。",
    };
  }

  return { ok: true, cleaned };
}

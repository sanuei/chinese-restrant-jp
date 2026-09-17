import type { SVGProps } from "react";

/**
 * 社交平台图标。
 * lucide-react 没有品牌图标（Instagram / YouTube 都没有导出），
 * 所以这里用基础图形自己画：线条风格和站点其它图标（lucide 描边图标）保持一致，
 * 不引第三方图标包。
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5.2" />
      <circle cx="12" cy="12" r="4.3" />
      <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2.1}>
      <path d="M4 3.5 20 20.5" />
      <path d="M20 3.5 4 20.5" />
    </svg>
  );
}

export function YoutubeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.4" y="5.2" width="19.2" height="13.6" rx="4.4" />
      <path d="M10.4 9.4 15.3 12l-4.9 2.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const SOCIAL_LINKS = [
  {
    key: "instagram",
    href: "https://www.instagram.com/sonic_yann/",
    label: "Instagram",
    Icon: InstagramIcon,
  },
  {
    key: "x",
    href: "https://x.com/sonic_yann",
    label: "X",
    Icon: XIcon,
  },
  {
    key: "youtube",
    href: "https://www.youtube.com/@sonicyann",
    label: "YouTube",
    Icon: YoutubeIcon,
  },
] as const;

type Props = {
  iconOnly?: boolean;
};

export default function SocialLinks({ iconOnly = false }: Props) {
  return (
    <ul className="flex items-center gap-2">
      {SOCIAL_LINKS.map(({ key, href, label, Icon }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer me"
            aria-label={label}
            title={label}
            className={`flex items-center justify-center gap-2 rounded-full border border-warm-200 bg-warm-50 text-ink-700 transition-colors hover:border-vermilion-300 hover:text-vermilion-700 ${
              iconOnly ? "h-9 w-9" : "h-9 px-3 text-xs font-semibold"
            }`}
          >
            <Icon size={17} />
            {!iconOnly && <span>{label}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

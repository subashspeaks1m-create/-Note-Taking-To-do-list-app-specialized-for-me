import type { SVGProps } from 'react';

/**
 * The kit's stroke icons (assets/ui/icon-*.svg), inlined so they can follow
 * `currentColor` for active, hover and category states.
 */
const PATHS = {
  today: (
    <>
      <rect x="5" y="5" width="14" height="15" rx="3" />
      <path d="M8 3V7M16 3V7M5 10H19M9 14L11 16L15 12" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="3" />
      <path d="M8 3V7M16 3V7M4 10H20M8 14H9M12 14H13M16 14H17M8 17H9M12 17H13" />
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21V19A8 8 0 0 1 20 19V21M9 18L12 20L15 18" />
    </>
  ),
  check: <path d="M5 12 10 17 20 7" />,
  doing: <path d="M13 2 5 13H11L10 22L19 10H13Z" />,
  insights: <path d="M4 3V21H21M8 17V12M13 17V8M18 17V4" />,
  journal: <path d="M5 4H17A2 2 0 0 1 19 6V20H7A2 2 0 0 1 5 18ZM5 16H19M9 8H15M9 11H15" />,
  learning: <path d="M3 5Q7 3 12 6Q17 3 21 5V19Q17 17 12 20Q7 17 3 19ZM12 6V20" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7A4 4 0 0 1 16 7V10M12 14V17" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)" />
    </>
  ),
  plus: <path d="M12 4V20M4 12H20" />,
  vault: <path d="M10 6.5A2 2 0 1 1 13 8.2C12.4 8.6 12 9.1 12 9.8V10.5L3.6 16.4A1.2 1.2 0 0 0 4.3 18.6H19.7A1.2 1.2 0 0 0 20.4 16.4L12 10.5" />,
  download: <path d="M12 4V15M7 10.5 12 15.5 17 10.5M5 19H19" />,
  principles: <path d="M12 3 14.4 8.8 20.6 9.3 15.9 13.3 17.3 19.4 12 16.1 6.7 19.4 8.1 13.3 3.4 9.3 9.6 8.8Z" />,
  settings: (
    <>
      <path d="M4 7H20M4 17H20" />
      <circle cx="9" cy="7" r="3" fill="var(--icon-knockout, #111923)" />
      <circle cx="15" cy="17" r="3" fill="var(--icon-knockout, #111923)" />
    </>
  ),
  vision: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2V5M22 12H19M12 22V19M2 12H5" />
    </>
  ),
  // Small interface glyphs drawn in the same 1.65 stroke style.
  chevronLeft: <path d="M15 5 8 12 15 19" />,
  chevronRight: <path d="M9 5 16 12 9 19" />,
  chevronDown: <path d="M5 9 12 16 19 9" />,
  chevronUp: <path d="M5 15 12 8 19 15" />,
  close: <path d="M6 6 18 18M18 6 6 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16 20.5 20.5" />
    </>
  ),
  flame: <path d="M12 21C8 21 6 18.2 6 15.2 6 11 10 9.5 10 5.5 12.8 7 14 9 14 11.2 15 10.4 15.6 9.4 15.8 8.4 17.2 10 18 12.3 18 15 18 18.4 15.6 21 12 21Z" />,
  collapse: <path d="M4 9H20M4 15H20M9 4 12 1.5 15 4M9 20 12 22.5 15 20" />,
  expand: <path d="M4 12H20M9 7 12 4 15 7M9 17 12 20 15 17" />,
  sparkle: <path d="M12 3 13.8 10.2 21 12 13.8 13.8 12 21 10.2 13.8 3 12 10.2 10.2Z" />,
  pen: <path d="M4 20H8L19 9A2.8 2.8 0 0 0 15 5L4 16ZM13.5 6.5 17.5 10.5" />,
  reflection: <path d="M12 3A9 9 0 1 0 21 12 7 7 0 0 1 12 3Z" />,
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9.5 4.5V19.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Set when the icon is the only content of a control; otherwise it is decorative. */
  title?: string;
}

export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

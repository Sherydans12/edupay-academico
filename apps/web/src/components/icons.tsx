import type { SVGProps } from 'react';

export type IconName =
  | 'archive'
  | 'bell'
  | 'book'
  | 'calendar'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'clipboard'
  | 'clock'
  | 'close'
  | 'document'
  | 'download'
  | 'home'
  | 'layers'
  | 'menu'
  | 'message'
  | 'more'
  | 'paperclip'
  | 'people'
  | 'plus'
  | 'review'
  | 'search'
  | 'settings'
  | 'spark'
  | 'upload';

const paths: Record<IconName, React.ReactNode> = {
  archive: <><path d="M4 7.5h16v12H4z"/><path d="M3 4.5h18v3H3zM9 11h6"/></>,
  bell: <><path d="M18 9a6 6 0 00-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8"/><path d="M10 21h4"/></>,
  book: <><path d="M4 5.5A2.5 2.5 0 016.5 3H11v16H6.5A2.5 2.5 0 004 21.5z"/><path d="M20 5.5A2.5 2.5 0 0017.5 3H13v16h4.5a2.5 2.5 0 012.5 2.5z"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  check: <path d="M5 12.5l4 4L19 6.5"/>,
  'chevron-down': <path d="M6 9l6 6 6-6"/>,
  'chevron-right': <path d="M9 6l6 6-6 6"/>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  close: <path d="M6 6l12 12M18 6L6 18"/>,
  document: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></>,
  home: <><path d="M3 11l9-8 9 8"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6"/></>,
  layers: <><path d="M12 3L3 8l9 5 9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  message: <path d="M4 4h16v13H8l-4 4z"/>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  paperclip: <path d="M8 12.5l6.5-6.5a3 3 0 014.2 4.2l-8.2 8.2a5 5 0 01-7.1-7.1l8-8"/>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0M16 5a3 3 0 010 6M17 14a5 5 0 014 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  review: <><path d="M4 3h12v18H4z"/><path d="M8 8h4M8 12h4M8 16h2M16 8l4 4-4 4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z"/></>,
  spark: <><path d="M12 2l1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9z"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

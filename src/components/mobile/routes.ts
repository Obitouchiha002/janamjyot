/**
 * Route metadata for the app shell.
 *
 * The shell needs two things the router does not give us: a human title for the
 * top bar, and a "depth" so page transitions know whether a navigation is a
 * push (slide in from the right) or a pop (slide back out). Depth also tells us
 * when to show the back chevron.
 */
import {
  Home, Users, CalendarDays, Wand2, LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

export interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** The five root destinations. Everything else is a pushed screen. */
export const TABS: TabDef[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/profiles', label: 'Kundli', icon: Users },
  { to: '/panchang', label: 'Panchang', icon: CalendarDays },
  { to: '/tools', label: 'Tools', icon: Wand2 },
  { to: '/more', label: 'More', icon: LayoutGrid },
];

const TAB_PATHS = new Set(TABS.map((t) => t.to));

export function isRootTab(pathname: string): boolean {
  return TAB_PATHS.has(pathname);
}

/** Title shown in the top bar. Matched most-specific first. */
const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'JanamJyot'],
  [/^\/profiles$/, 'My Kundlis'],
  [/^\/panchang$/, 'Panchang'],
  [/^\/tools$/, 'Tools'],
  [/^\/more$/, 'More'],
  [/^\/create-chart$/, 'New Kundli'],
  [/^\/edit-chart\//, 'Edit Kundli'],
  [/^\/dashboard\//, 'Kundli'],
  [/^\/chart\/[^/]+\/d1$/, 'Lagna Chart (D1)'],
  [/^\/chart\/[^/]+\/d9$/, 'Navamsa (D9)'],
  [/^\/chart\/[^/]+\/divisional$/, 'Divisional Charts'],
  [/^\/chart\/[^/]+\/dasha$/, 'Dasha Timeline'],
  [/^\/chart\/[^/]+\/remedies$/, 'Remedies'],
  [/^\/daily\//, 'Daily Guidance'],
  [/^\/right-now\//, 'Abhi Sahi Hai?'],
  [/^\/timeline\//, 'Life Timeline'],
  [/^\/notifications$/, 'Notifications'],
  [/^\/plan$/, 'My Plan'],
  [/^\/reports\/[^/]+\/[^/]+$/, 'Report'],
  [/^\/reports\//, 'Reports'],
  [/^\/report\//, 'Life Report'],
  [/^\/chat\//, 'Jyotish'],
  [/^\/match$/, 'Kundli Matching'],
  [/^\/muhurat$/, 'Muhurat'],
  [/^\/yogas$/, 'Yogas'],
  [/^\/ashtakavarga$/, 'Ashtakavarga'],
  [/^\/alerts$/, 'Alerts'],
  [/^\/settings$/, 'Settings'],
  [/^\/theme$/, 'Theme'],
  [/^\/developer$/, 'Developer'],
  [/^\/help$/, 'Help & Support'],
  [/^\/ai-status$/, 'AI Status'],
  [/^\/admin$/, 'Admin'],
  [/^\/login$/, 'Sign In'],
];

export function titleFor(pathname: string): string {
  for (const [re, title] of TITLES) if (re.test(pathname)) return title;
  return 'JanamJyot';
}

/**
 * Navigation depth. Root tabs are 0; a screen pushed from a tab is 1; screens
 * pushed from those go deeper. Comparing depth between two locations tells the
 * transition which way to slide.
 */
export function depthOf(pathname: string): number {
  if (isRootTab(pathname)) return 0;
  if (/^\/(create-chart|match|login|help|settings|developer|ai-status|admin|muhurat|yogas|ashtakavarga|alerts|plan)$/.test(pathname)) return 1;
  if (/^\/edit-chart\//.test(pathname)) return 1;
  if (/^\/theme$/.test(pathname)) return 2;
  if (/^\/dashboard\//.test(pathname)) return 1;
  return 2; // chart sub-screens, report, chat
}

/** Screens that hide the tab bar to give the content the full height. */
export function hidesTabBar(pathname: string): boolean {
  return /^\/(login)$/.test(pathname) || /^\/(report|chat)\//.test(pathname);
}

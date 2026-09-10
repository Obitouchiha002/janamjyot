/**
 * Route metadata for the app shell.
 *
 * The shell needs two things the router does not give us: a human title for the
 * top bar, and a "depth" so page transitions know whether a navigation is a
 * push (slide in from the right) or a pop (slide back out). Depth also tells us
 * when to show the back chevron.
 */
import {
  Home, Users, MessageCircle, Wand2, LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { getLang } from '@/lib/prefs';

export interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The raised middle tab — the chat, which is the app's centre. */
  center?: boolean;
}

/** The five root destinations. Everything else is a pushed screen. */
export const TABS: TabDef[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/profiles', label: 'Kundli', icon: Users },
  // Panchang stays one tap away from Home (quick actions + the day chip) and More.
  { to: '/chat', label: 'Chat', icon: MessageCircle, center: true },
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
  [/^\/chat$/, 'Jyotish'],
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

/**
 * Where "back" should go when there is nothing to go back TO.
 *
 * `navigate(-1)` needs a previous entry, and a refresh throws the stack away —
 * so on any screen reached by reloading, or by opening a link directly, the
 * back chevron did nothing at all. This gives it somewhere sensible to land:
 * the screen this one sits under, rather than the app's front door.
 */
export function parentOf(pathname: string): string {
  // The chat is the app's centre, so it sits under Home, not under a kundli.
  if (/^\/chat\//.test(pathname)) return "/";
  const owner = pathname.match(/^\/(?:report|timeline|daily|right-now|reports)\/([^/]+)/)?.[1]
    ?? pathname.match(/^\/chart\/([^/]+)\//)?.[1];
  if (owner) return `/dashboard/${owner}`;
  if (/^\/dashboard\//.test(pathname)) return "/profiles";
  if (/^\/(theme|notifications)$/.test(pathname)) return "/settings";
  if (/^\/(settings|help|developer|ai-status|admin|plan)$/.test(pathname)) return "/more";
  if (/^\/(muhurat|yogas|ashtakavarga|alerts)$/.test(pathname)) return "/tools";
  if (/^\/(create-chart|edit-chart)/.test(pathname)) return "/profiles";
  return "/";
}

/** Top-bar titles in the chosen language (English is the key). */
const TITLE_I18N: Record<string, { hi: string; hinglish: string }> = {
  'My Kundlis': { hi: 'मेरी कुंडलियाँ', hinglish: 'Meri kundliyan' },
  'Panchang': { hi: 'पंचांग', hinglish: 'Panchang' },
  'Tools': { hi: 'टूल्स', hinglish: 'Tools' },
  'More': { hi: 'और', hinglish: 'More' },
  'New Kundli': { hi: 'नई कुंडली', hinglish: 'Nayi kundli' },
  'Edit Kundli': { hi: 'कुंडली बदलें', hinglish: 'Kundli badlein' },
  'Kundli': { hi: 'कुंडली', hinglish: 'Kundli' },
  'Lagna Chart (D1)': { hi: 'लग्न कुंडली (D1)', hinglish: 'Lagna kundli (D1)' },
  'Navamsa (D9)': { hi: 'नवांश (D9)', hinglish: 'Navamsa (D9)' },
  'Divisional Charts': { hi: 'वर्ग कुंडलियाँ', hinglish: 'Varga kundliyan' },
  'Dasha Timeline': { hi: 'दशा समय-रेखा', hinglish: 'Dasha timeline' },
  'Remedies': { hi: 'उपाय', hinglish: 'Upay' },
  'Daily Guidance': { hi: 'आज का मार्गदर्शन', hinglish: 'Aaj ka margdarshan' },
  'Abhi Sahi Hai?': { hi: 'अभी सही है?', hinglish: 'Abhi sahi hai?' },
  'Life Timeline': { hi: 'जीवन समय-रेखा', hinglish: 'Life timeline' },
  'Notifications': { hi: 'सूचनाएँ', hinglish: 'Notifications' },
  'My Plan': { hi: 'मेरा प्लान', hinglish: 'Mera plan' },
  'Report': { hi: 'रिपोर्ट', hinglish: 'Report' },
  'Reports': { hi: 'रिपोर्ट', hinglish: 'Reports' },
  'Life Report': { hi: 'जीवन रिपोर्ट', hinglish: 'Life report' },
  'Jyotish': { hi: 'ज्योतिष', hinglish: 'Jyotish' },
  'Kundli Matching': { hi: 'कुंडली मिलान', hinglish: 'Kundli milan' },
  'Muhurat': { hi: 'मुहूर्त', hinglish: 'Muhurat' },
  'Yogas': { hi: 'योग', hinglish: 'Yog' },
  'Ashtakavarga': { hi: 'अष्टकवर्ग', hinglish: 'Ashtakavarga' },
  'Alerts': { hi: 'अलर्ट', hinglish: 'Alerts' },
  'Settings': { hi: 'सेटिंग्स', hinglish: 'Settings' },
  'Theme': { hi: 'थीम', hinglish: 'Theme' },
  'Help & Support': { hi: 'मदद और सहायता', hinglish: 'Help & support' },
  'Sign In': { hi: 'साइन इन', hinglish: 'Sign in' },
};
export function localTitle(title: string): string {
  const l = getLang();
  if (l !== 'hi' && l !== 'hinglish') return title;
  return TITLE_I18N[title]?.[l] ?? title;
}

/** Tab labels in the chosen language. */
const TAB_I18N: Record<string, { hi: string; hinglish: string }> = {
  '/': { hi: 'होम', hinglish: 'Home' },
  '/profiles': { hi: 'कुंडली', hinglish: 'Kundli' },
  '/chat': { hi: 'चैट', hinglish: 'Chat' },
  '/tools': { hi: 'टूल्स', hinglish: 'Tools' },
  '/more': { hi: 'और', hinglish: 'More' },
};
export function tabLabel(to: string, fallback: string): string {
  const l = getLang();
  if (l !== 'hi' && l !== 'hinglish') return fallback;
  return TAB_I18N[to]?.[l] ?? fallback;
}

/**
 * How wide a screen should be allowed to get.
 *
 * Every screen in this app was drawn for a phone, where there is exactly one
 * width. Given a desktop window they all took the whole of it, and a form is
 * the worst case: a name field 1,600 pixels wide with a giant pill button
 * under it does not look powerful, it looks broken.
 *
 * So each route says what KIND of screen it is, and the shell caps it:
 *   • narrow — a form, a settings list, a page of text. One column, ~720px,
 *     the width people actually read and fill in at.
 *   • wide — a dashboard, a chart, a report, a conversation. These have their
 *     own desktop layouts and want the room.
 *
 * Phones ignore all of it: below 1024px there is only ever one width.
 */
import { useEffect, useState } from 'react';

const NARROW = [
  /^\/create-chart$/,
  /^\/edit-chart\//,
  /^\/login$/,
  /^\/reset-password$/,
  /^\/settings$/,
  /^\/theme$/,
  /^\/notifications$/,
  /^\/plan$/,
  /^\/help$/,
  /^\/more$/,
  /^\/alerts$/,
  /^\/decide/,
  /^\/ai-status$/,
  /^\/developer$/,
];

export function widthFor(pathname: string): 'narrow' | 'wide' {
  return NARROW.some((re) => re.test(pathname)) ? 'narrow' : 'wide';
}

/** True while the window is desktop-sized. Used to pick the page transition. */
export function useIsDesktop(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Home — whichever Home this is.
 *
 * The phone's Home and the desktop's are different screens, not one screen
 * stretched: a phone gets the layout the app launched with, a wide window gets
 * the dashboard built for it. They share the profile cache and nothing else,
 * so a change to one can never turn up on the other — which is exactly what
 * happened when they were the same file.
 *
 * The Android build always takes the phone screen: it ships with the phone's
 * chrome (top bar, bottom tabs), and a tablet running the APK should get the
 * screen that matches it.
 */
import { lazy, Suspense } from 'react';
import { isNative } from '@/lib/native';
import { useIsDesktop } from '@/lib/layout';

export { invalidateProfiles } from './home/profiles';

const HomeMobile = lazy(() => import('./home/HomeMobile'));
const HomeDesktop = lazy(() => import('./home/HomeDesktop'));

export default function HomePage() {
  const wide = useIsDesktop() && !isNative;
  return (
    <Suspense fallback={<div className="skeleton mt-4 h-64" />}>
      {wide ? <HomeDesktop /> : <HomeMobile />}
    </Suspense>
  );
}

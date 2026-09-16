import { useEffect, useRef, useState, lazy, Suspense} from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useParams,
  Navigate,
} from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Megaphone, WifiOff } from 'lucide-react';

import { AuthProvider, useAuth } from './auth';
import ProtectedRoute from './components/ProtectedRoute';
import { useTheme, isDarkTheme } from './theme';
import { isNative, isLowPowerDevice, initNative, hideSplash, setStatusBarForTheme } from './lib/native';
import { applyNotifications } from './lib/notifications';
import { otaReady, checkWebUpdate } from './lib/ota';
import { pickPrimary } from './lib/primary';
import { isOnline, onConnectivityChange } from './lib/offline';
import { isLockEnabled } from './lib/biometric';

import TopBar from './components/mobile/TopBar';
import TabBar from './components/mobile/TabBar';
import TopNav from './components/desktop/TopNav';
import QuotaListener from './components/mobile/QuotaSheet';
import { LoadError } from './components/ErrorState';
import FeedbackListener from './components/mobile/FeedbackSheet';
import LockScreen from './components/mobile/LockScreen';
import UpdateSheet from './components/mobile/UpdateSheet';
import LanguageGate, { languageChosen } from './components/LanguageGate';
import { depthOf, hidesTabBar } from './components/mobile/routes';

import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';

/*
 * Every other screen is its own chunk.
 *
 * All thirty-four pages used to be imported eagerly, so opening the app
 * meant downloading and PARSING 930KB of JavaScript before the first pixel
 * — the admin panel, the PDF builder, the matching engine's UI, all of it,
 * for someone who just wanted to see today's panchang. On a mid-range
 * Android phone that parse alone is seconds of a blank screen, and it is
 * the whole of the "app feels laggy" complaint.
 *
 * Now a screen arrives when it is opened. The comment below about the five
 * retired chat surfaces still applies: their paths redirect into ChatPage.
 */
const AdminPage = lazy(() => import('./pages/AdminPage'));
const CreateChartPage = lazy(() => import('./pages/CreateChartPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const D1ChartPage = lazy(() => import('./pages/D1ChartPage'));
const D9ChartPage = lazy(() => import('./pages/D9ChartPage'));
const DivisionalChartsPage = lazy(() => import('./pages/DivisionalChartsPage'));
const DashaPage = lazy(() => import('./pages/DashaPage'));
const LifeReportPage = lazy(() => import('./pages/LifeReportPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ChatHome = lazy(() => import('./pages/ChatHome'));
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AIStatusPage = lazy(() => import('./pages/AIStatusPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const MatchingPage = lazy(() => import('./pages/MatchingPage'));
const DecidePage = lazy(() => import('./pages/DecidePage'));
const DecideHistoryPage = lazy(() => import('./pages/DecideHistoryPage'));
const MorePage = lazy(() => import('./pages/MorePage'));
const PanchangPage = lazy(() => import('./pages/PanchangPage'));
const MuhuratPage = lazy(() => import('./pages/MuhuratPage'));
const YogasPage = lazy(() => import('./pages/YogasPage'));
const AshtakavargaPage = lazy(() => import('./pages/AshtakavargaPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AdvancedToolsPage = lazy(() => import('./pages/AdvancedToolsPage'));
const RemediesPage = lazy(() => import('./pages/RemediesPage'));
const DailyGuidancePage = lazy(() => import('./pages/DailyGuidancePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ReportViewPage = lazy(() => import('./pages/ReportViewPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ThemePage = lazy(() => import('./pages/ThemePage'));
const RightNowPage = lazy(() => import('./pages/RightNowPage'));
const DeveloperPage = lazy(() => import('./pages/DeveloperPage'));

/**
 * Offline strip. Appears only when connectivity drops, so the user knows why
 * things may look slightly out of date — cached screens still work.
 */
function OfflineBanner() {
  const [off, setOff] = useState(!isOnline());
  useEffect(() => onConnectivityChange((on) => setOff(!on)), []);
  if (!off) return null;
  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-[12.5px] font-medium text-amber-600">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="leading-snug">You&apos;re offline — showing your saved data.</span>
    </div>
  );
}

/** Admin-set announcement, shown under the app bar. */
function AnnouncementBanner() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setMsg(d.announcement || null))
      .catch(() => {});
  }, []);
  if (!msg) return null;
  return (
    <div className="mx-4 mb-4 flex items-center gap-2 rounded-2xl bg-accent/15 border border-accent/30 px-4 py-2.5 text-[13px] text-accent">
      <Megaphone className="w-4 h-4 shrink-0" />
      <span className="leading-snug">{msg}</span>
    </div>
  );
}

/**
 * `location` is passed explicitly: during a transition the outgoing screen is
 * still mounted, and without a pinned location it would re-render itself as the
 * *incoming* route — so both halves of the animation would show the same page.
 */
/**
 * Catch-all. Reached by a stale notification deep-link, an old share URL, or a
 * typo — without it those rendered the shell around a silently empty body.
 * Navigates client-side (we are inside the Router here, unlike the crash
 * boundary in ErrorState, which has to do a real document load).
 */
function NotFound() {
  const navigate = useNavigate();
  return (
    <LoadError
      title="Screen not found"
      hint="That link doesn't point anywhere in the app any more."
      onRetry={() => navigate('/', { replace: true })}
    />
  );
}

/** Shown for the instant a screen's own chunk is still arriving. */
function ScreenSkeleton() {
  return (
    <div className="space-y-3 pt-2" aria-hidden>
      <div className="skeleton h-[74px]" />
      <div className="skeleton h-[150px]" />
      <div className="skeleton h-[110px] opacity-70" />
      <div className="skeleton h-[110px] opacity-45" />
    </div>
  );
}

/** Redirect any old chat path (/ask, /transit, /sectors) into the one chat. */
function ToChat() {
  const { chartId } = useParams();
  return <Navigate to={chartId ? `/chat/${chartId}` : '/'} replace />;
}

function AppRoutes({ location }: { location: ReturnType<typeof useLocation> }) {
  return (
    <Routes location={location}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/admin" element={<ProtectedRoute admin><AdminPage /></ProtectedRoute>} />
      <Route path="/" element={<HomePage />} />
      <Route path="/create-chart" element={<CreateChartPage />} />
      {/* Same component in edit mode — see CreateChartPage. */}
      <Route path="/edit-chart/:chartId" element={<CreateChartPage />} />
      <Route path="/dashboard/:chartId" element={<DashboardPage />} />
      <Route path="/chart/:chartId/d1" element={<D1ChartPage />} />
      <Route path="/chart/:chartId/d9" element={<D9ChartPage />} />
      <Route path="/chart/:chartId/divisional" element={<DivisionalChartsPage />} />
      <Route path="/chart/:chartId/dasha" element={<DashaPage />} />
      <Route path="/chart/:chartId/remedies" element={<RemediesPage />} />
      <Route path="/daily/:chartId" element={<DailyGuidancePage />} />
      <Route path="/right-now/:chartId" element={<RightNowPage />} />
      <Route path="/timeline/:chartId" element={<TimelinePage />} />
      <Route path="/report/:chartId" element={<LifeReportPage />} />
      <Route path="/reports/:chartId" element={<ReportsPage />} />
      <Route path="/reports/:chartId/:type" element={<ReportViewPage />} />
      {/* The one chat. */}
      {/* The website links here; it is the app's front door, not a screen. */}
      <Route path="/app" element={<Navigate to="/" replace />} />
      <Route path="/chat" element={<ChatHome />} />
      <Route path="/chat/:chartId" element={<ChatPage />} />
      {/* Old chat paths → the one chat (keeps every existing link working). */}
      <Route path="/ask/:chartId" element={<ToChat />} />
      <Route path="/ask/:chartId/:astrologer" element={<ToChat />} />
      <Route path="/transit/:chartId" element={<ToChat />} />
      <Route path="/sectors/:chartId" element={<ToChat />} />
      <Route path="/profiles" element={<ProfilesPage />} />
      <Route path="/ai-status" element={<AIStatusPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/match" element={<MatchingPage />} />
      <Route path="/decide" element={<DecidePage />} />
      <Route path="/decide/history" element={<DecideHistoryPage />} />
      <Route path="/more" element={<MorePage />} />
      <Route path="/panchang" element={<PanchangPage />} />
      <Route path="/muhurat" element={<MuhuratPage />} />
      <Route path="/yogas" element={<YogasPage />} />
      <Route path="/ashtakavarga" element={<AshtakavargaPage />} />
      <Route path="/alerts" element={<AlertsPage />} />
      <Route path="/tools" element={<AdvancedToolsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/theme" element={<ThemePage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/plan" element={<PlanPage />} />
      <Route path="/developer" element={<DeveloperPage />} />
      {/* Without this, a stale notification deep-link or a bad share URL renders
          the shell around an empty body, with no hint anything went wrong. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/**
 * The app shell: fixed chrome, one scrolling surface, and screens that slide in
 * and out of it.
 *
 * Direction comes from route depth — going deeper slides the new screen in from
 * the right, going back slides it out to the right. That single rule is what
 * gives the app a sense of place instead of pages blinking in and out.
 */
function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme] = useTheme();
  const dark = isDarkTheme(theme);
  const { user, loading } = useAuth();

  // App Lock: when enabled, nothing renders until the OS verifies the user, and
  // it re-locks whenever the app has been in the background (so handing the
  // unlocked phone to someone doesn't expose the chart or chat history).
  const [locked, setLocked] = useState(() => isNative && isLockEnabled());
  // First launch asks for the language before the app says a word.
  const [langOk, setLangOk] = useState(languageChosen);
  useEffect(() => {
    if (!isNative) return;
    let handle: any;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && isLockEnabled()) setLocked(true);
      }).then((h) => { handle = h; });
    }).catch(() => {});
    return () => { handle?.remove?.(); };
  }, []);

  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const depth = depthOf(location.pathname);
  const prevDepth = useRef(depth);
  const back = depth < prevDepth.current;
  useEffect(() => { prevDepth.current = depth; }, [depth]);

  const showTabs = !hidesTabBar(location.pathname);

  // Native chrome: mark the html element so the CSS can lock the document, then
  // hide the splash once React has actually painted.
  useEffect(() => {
    if (isNative) document.documentElement.classList.add('app-native');
    if (isLowPowerDevice) document.documentElement.classList.add('low-power');
  }, []);

  // Hold the splash until the session has resolved, so a returning user never
  // sees a blank frame between the splash and their first real screen.
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(hideSplash, 60);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // Hardware back: pop a route if we can, otherwise let Android exit the app.
  useEffect(() => {
    return initNative({
      isDark: dark,
      onBack: () => {
        if (depthOf(window.location.pathname) > 0) {
          navigate(-1);
          return true;
        }
        return false;
      },
    });
  }, [navigate, dark]);

  // Keep the status bar icon tint in step with the chosen theme.
  useEffect(() => { setStatusBarForTheme(dark); }, [dark]);

  // Over the air: this bundle booted (a bundle that never gets here is rolled
  // back by the updater), then look for a newer one — now and whenever the app
  // comes back to the foreground.
  useEffect(() => {
    if (!isNative) return;
    // Settle the last attempt first, so a build that just failed is not fetched again.
    otaReady().then(() => checkWebUpdate(true));
    let handle: any;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) checkWebUpdate(); }).then((h) => { handle = h; });
    }).catch(() => {});
    return () => { handle?.remove?.(); };
  }, []);

  // Deep-link when the user taps a scheduled notification.
  useEffect(() => {
    if (!isNative) return;
    let handle: any;
    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.addListener('localNotificationActionPerformed', (a: any) => {
        const route = a?.notification?.extra?.route;
        if (typeof route === 'string' && route.startsWith('/')) navigate(route);
      }).then((h) => { handle = h; });
    }).catch(() => {});
    return () => { handle?.remove?.(); };
  }, [navigate]);

  // Re-apply scheduled reminders on every launch (keeps them fresh with the
  // latest chart/dasha, and re-installs any the OS may have dropped).
  useEffect(() => {
    if (!isNative) return;
    fetch('/api/profiles').then((r) => r.json()).then((d) => {
      // Their OWN chart — not whichever kundli was made last (often a partner's).
      const id = pickPrimary(Array.isArray(d) ? d : [], user?.name)?.id;
      if (!id) return;
      fetch(`/api/chart/${id}`).then((r) => r.json())
        .then((c) => applyNotifications({ chartId: id, dasha: c?.dasha?.current ?? null }))
        .catch(() => applyNotifications({ chartId: id }));
    }).catch(() => {});
  }, [user?.id]);

  // New screen → start at the top, and reset the app bar's scrolled state.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrolled(false);
  }, [location.pathname]);

  // While the session is still resolving, keep the (native) splash up rather
  // than flashing the auth screen for a frame; on web just render nothing.
  if (loading) return null;

  // App Lock comes before everything — even the auth gate.
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  if (!langOk) return <LanguageGate onDone={() => setLangOk(true)} />;

  /*
   * No first-run tour.
   *
   * Three slides stood between a new person and the app, and on a real phone
   * the "Next" button did nothing — so the very first screen of the app was a
   * dead end. A tour is not worth one person being unable to get in, and the
   * thing it was explaining (make a kundli from your birth details) is what
   * the home screen already says. New accounts still land on /create-chart
   * from sign-in, which was the only genuinely useful thing the tour did.
   */

  // The emailed password-reset link must open even while signed out, so it
  // bypasses the launch auth gate below.
  if (!user && location.pathname === '/reset-password') {
    return (
      <div className="app-shell bg-background text-foreground">
        <div className="app-scroll no-tabbar" style={{ paddingTop: 'calc(var(--sat) + 12px)' }}>
          <div className="app-content px-4 pb-6"><ResetPasswordPage /></div>
        </div>
      </div>
    );
  }

  // Sign-in wall. Unlike the earlier version of this gate, it is backed by the
  // server: every non-public /api route now 401s without a token, so this is
  // the real boundary rather than a screen someone can skip. No "continue as
  // guest" for the same reason — there is nothing a guest could load.
  //
  // Charts a device created before this shipped are adopted on first sign-in
  // (claimDeviceCharts), so nobody loses the kundlis they already made.
  if (!user) {
    return (
      <div className="app-shell bg-background text-foreground">
        <div className="app-scroll no-tabbar" style={{ paddingTop: 'calc(var(--sat) + 12px)' }}>
          <div className="app-content px-4 pb-6">
            <LoginPage />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell app-desktop bg-background text-foreground">
      {/* Desktop / iPad top navbar (>=768px, CSS-gated). Phones keep the mobile
          top bar + bottom tab bar below. */}
      <TopNav />
      <TopBar scrolled={scrolled} />

      <div
        ref={scrollRef}
        className={`app-scroll ${showTabs ? '' : 'no-tabbar'}`}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 6)}
      >
        <OfflineBanner />
        <AnnouncementBanner />
        {/* "wait": the old screen leaves before the new one arrives, so the
            two never overlap. Both legs are short tweens (≤150ms) — a spring
            here read as the app lagging behind the tap. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, x: (back ? -1 : 1) * (isLowPowerDevice ? 8 : 14) }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.07, ease: 'easeOut' } }}
            className="app-content px-4 pb-6"
          >
            {/*
              A screen now arrives as its own chunk, so there is a moment
              between the tap and the code. The fallback is a plain skeleton
              rather than a spinner: a spinner announces a wait, a skeleton
              reads as the screen already arriving, and on a warm cache it is
              gone in a frame either way.
            */}
            <Suspense fallback={<ScreenSkeleton />}>
              <AppRoutes location={location} />
            </Suspense>
          </motion.main>
        </AnimatePresence>
      </div>

      {showTabs && <TabBar />}

      {/* Global quota-reached sheet — reacts to the `va-quota` event. */}
      <QuotaListener />

      {/* Global feedback / rating sheet — reacts to the `jj-feedback` event. */}
      <FeedbackListener />

      {/* Offers the newer APK when this build is behind (sideloaded = no store). */}
      <UpdateSheet />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Shell />
      </Router>
    </AuthProvider>
  );
}

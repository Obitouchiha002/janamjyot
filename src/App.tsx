import { useEffect, useRef, useState } from 'react';
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
import { depthOf, hidesTabBar } from './components/mobile/routes';

import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import CreateChartPage from './pages/CreateChartPage';
import DashboardPage from './pages/DashboardPage';
import D1ChartPage from './pages/D1ChartPage';
import D9ChartPage from './pages/D9ChartPage';
import DivisionalChartsPage from './pages/DivisionalChartsPage';
import DashaPage from './pages/DashaPage';
import LifeReportPage from './pages/LifeReportPage';
// The five old chat surfaces (AskQuestionPage, AstrologersPage, ConsultPage,
// TransitPage, SectorsPage) are retired in favour of ONE universal chat. Their
// files stay in the repo for now, but every old path redirects into ChatPage so
// existing links, buttons and notification deep-links all still land somewhere.
import ChatPage from './pages/ChatPage';
import ProfilesPage from './pages/ProfilesPage';
import SettingsPage from './pages/SettingsPage';
import AIStatusPage from './pages/AIStatusPage';
import HelpPage from './pages/HelpPage';
import MatchingPage from './pages/MatchingPage';
import MorePage from './pages/MorePage';
import PanchangPage from './pages/PanchangPage';
import MuhuratPage from './pages/MuhuratPage';
import YogasPage from './pages/YogasPage';
import AshtakavargaPage from './pages/AshtakavargaPage';
import AlertsPage from './pages/AlertsPage';
import AdvancedToolsPage from './pages/AdvancedToolsPage';
import RemediesPage from './pages/RemediesPage';
import DailyGuidancePage from './pages/DailyGuidancePage';
import NotificationsPage from './pages/NotificationsPage';
import ReportsPage from './pages/ReportsPage';
import ReportViewPage from './pages/ReportViewPage';
import TimelinePage from './pages/TimelinePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ThemePage from './pages/ThemePage';
import RightNowPage from './pages/RightNowPage';
import DeveloperPage from './pages/DeveloperPage';

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
      const id = Array.isArray(d) && d[0]?.id;
      if (!id) return;
      fetch(`/api/chart/${id}`).then((r) => r.json())
        .then((c) => applyNotifications({ chartId: id, dasha: c?.dasha?.current ?? null }))
        .catch(() => applyNotifications({ chartId: id }));
    }).catch(() => {});
  }, []);

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
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.main
            key={location.pathname}
            // No `scale` on purpose: animating it forces a relayout every frame,
            // which shows as jank on weak GPUs. A translate + fade composites on
            // the GPU alone. On low-power devices we shorten the slide and use a
            // quick tween instead of a spring so the frame budget is easy to hit.
            initial={{ opacity: 0, x: (back ? -1 : 1) * (isLowPowerDevice ? 24 : 64) }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: (back ? 1 : -1) * (isLowPowerDevice ? 24 : 64) }}
            transition={
              isLowPowerDevice
                ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                : { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }
            }
            className="app-content px-4 pb-6"
          >
            <AppRoutes location={location} />
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

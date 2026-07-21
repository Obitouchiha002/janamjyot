import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';

/**
 * The screen to show when a load failed.
 *
 * Every page that fetches needs one: the alternative most of them had was
 * `return null`, which renders the top bar over an empty body — the user can't
 * tell a failure from an empty account, and has nothing to tap.
 */
export function LoadError({
  title = "Couldn't load this",
  hint = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="m-card mt-6 flex flex-col items-center gap-2 p-6 text-center">
      <AlertTriangle className="h-7 w-7 text-muted-foreground" />
      <p className="text-[15px] font-bold">{title}</p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
      {onRetry && (
        <Pressable
          onClick={() => { haptic.tap(); onRetry(); }}
          subtle
          className="mt-3 flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-bold text-accent-foreground"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </Pressable>
      )}
    </div>
  );
}

/**
 * Catches render-time throws so one bad API response can't take down the app.
 *
 * In a browser a crashed React tree is a reload away; inside the APK there is
 * no reload affordance, so an uncaught throw means a white screen and a
 * force-quit. Reset works by remounting children under a new key.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean; key: number }
> {
  state = { error: false, key: 0 };

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[JanamJyot] render error', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell bg-background text-foreground">
          <div className="app-scroll no-tabbar" style={{ paddingTop: 'calc(var(--sat) + 24px)' }}>
            <div className="px-4">
              <LoadError
                title="Something went wrong"
                hint="This screen ran into an unexpected error. Going back usually fixes it."
                // A real document navigation, not a hash change. The app uses
                // BrowserRouter, so assigning `location.hash` navigated
                // nowhere: remounting simply re-rendered the same crashing
                // route and the error UI came straight back — leaving
                // force-quitting the APK as the only way out, which is the
                // exact failure this boundary exists to prevent. `replace`
                // also keeps the crashed entry out of history.
                onRetry={() => window.location.replace('/')}
              />
            </div>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}

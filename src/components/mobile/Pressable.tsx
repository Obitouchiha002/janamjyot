/**
 * The single tappable primitive for the app.
 *
 * Every interactive element goes through this so that a tap always feels the
 * same: a light haptic tick the instant the finger lands, and a spring press-in.
 * Firing the haptic on pointerdown (not click) is what makes it feel native —
 * on click it lands ~80ms late and reads as lag.
 */
import { forwardRef, type ReactNode, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { haptic } from '@/lib/native';

type Feedback = 'tap' | 'medium' | 'heavy' | 'select' | 'none';

interface Props {
  children: ReactNode;
  className?: string;
  /** Renders a router <Link> instead of a <button>. */
  to?: string;
  onClick?: () => void;
  feedback?: Feedback;
  disabled?: boolean;
  /** Smaller press-in, for dense rows where a full 0.96 scale looks jumpy. */
  subtle?: boolean;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

function buzz(kind: Feedback) {
  if (kind === 'none') return;
  haptic[kind]();
}

export const Pressable = forwardRef<any, Props>(function Pressable(
  // Default is NO haptic. A buzz on every card/row/nav tap feels cheap and was
  // firing on almost every touch (and at scroll-start). Premium apps buzz only
  // on meaningful actions, so those pass an explicit `feedback` (primary
  // buttons, toggles, send, tab switches). Everything else is silent.
  { children, className = '', to, onClick, feedback = 'none', disabled, subtle, style, ...rest },
  ref,
) {
  const cls = `pressable ${subtle ? 'pressable-sm' : ''} ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`;
  const onPointerDown = (e: PointerEvent) => {
    if (disabled || e.pointerType === 'mouse') return;
    buzz(feedback);
  };

  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} style={style} onPointerDown={onPointerDown} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      className={cls}
      style={style}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onClick={() => {
        // Mouse users get no haptic on pointerdown, so fire the click path here.
        onClick?.();
      }}
      {...rest}
    >
      {children}
    </button>
  );
});

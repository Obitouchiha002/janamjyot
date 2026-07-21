import { haptic } from '@/lib/native';

/**
 * The app's only toggle.
 *
 * The knob MUST carry an explicit `left`. Without one an absolutely positioned
 * element falls back to its static position, and a `<button>` centres its
 * inline content — so the knob started mid-track and the translate pushed it
 * off the right edge in both states. Anchor it at the 2px inset and let
 * `translate-x` do all the movement.
 *
 * Travel is `track − knob − (2 × inset)` = 44 − 20 − 4 = 20px.
 */
export default function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => { haptic.tap(); onChange(!on); }}
      className={`pressable tap-44 relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

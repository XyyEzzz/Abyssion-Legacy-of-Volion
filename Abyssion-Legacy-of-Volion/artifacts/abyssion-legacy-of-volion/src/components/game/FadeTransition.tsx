'use client';

import { useEffect, useRef, useState } from 'react';

interface FadeTransitionProps {
  /** Trigger a fade-to-black-and-back cycle. Increment to trigger. */
  trigger: number;
  /** Total duration of one full fade cycle in ms (default 500) */
  durationMs?: number;
  /** Callback fired at the midpoint (fully black) — use to swap screens */
  onMidpoint?: () => void;
  /** Whether the fade is currently active */
  onActiveChange?: (active: boolean) => void;
}

/**
 * Smooth fade-to-black overlay for major screen transitions.
 * Renders a full-screen black div that fades in, holds briefly,
 * then fades out. The `onMidpoint` callback fires when the overlay
 * is fully opaque — swap screen content there.
 */
export default function FadeTransition({
  trigger,
  durationMs = 500,
  onMidpoint,
  onActiveChange,
}: FadeTransitionProps) {
  const [opacity, setOpacity] = useState(0);
  const phaseRef = useRef<'idle' | 'fadeOut' | 'hold' | 'fadeIn'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midpointFiredRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (trigger === 0) return;

    // Start a new fade cycle
    clearTimer();
    phaseRef.current = 'fadeOut';
    midpointFiredRef.current = false;
    onActiveChange?.(true);

    const quarter = durationMs / 4;

    // Fade out (0 → 1)
    setOpacity(1);
    timerRef.current = setTimeout(() => {
      // Hold at full black
      phaseRef.current = 'hold';
      if (!midpointFiredRef.current) {
        midpointFiredRef.current = true;
        onMidpoint?.();
      }
      timerRef.current = setTimeout(() => {
        // Fade in (1 → 0)
        phaseRef.current = 'fadeIn';
        setOpacity(0);
        timerRef.current = setTimeout(() => {
          phaseRef.current = 'idle';
          onActiveChange?.(false);
        }, quarter);
      }, quarter);
    }, quarter);

    return () => clearTimer();
  }, [trigger, durationMs, onMidpoint, onActiveChange]);

  return (
    <div
      className="fixed inset-0 z-[200] pointer-events-none bg-black"
      style={{
        opacity,
        transition: `opacity ${durationMs / 4}ms ease-in-out`,
      }}
      aria-hidden="true"
    />
  );
}

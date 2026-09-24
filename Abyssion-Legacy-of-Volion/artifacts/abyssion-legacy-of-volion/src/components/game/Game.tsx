'use client';

import { useState, useEffect, useRef, useCallback, Component, type ReactNode } from 'react';
import GameScene from './GameScene';
import UI from './UI';
import DamageVignette from './DamageVignette';
import SettingsModal from './SettingsModal';
import DialogueModal from './DialogueModal';
import QuestLogModal from './QuestLogModal';
import InventoryModal from './InventoryModal';
import ShopModal from './ShopModal';
import LoadingScreen from './LoadingScreen';
import MainMenu from './MainMenu';
import FadeTransition from './FadeTransition';
import DebugOverlay from './DebugOverlay';
import FModeOverlay from './FModeOverlay';
import { useGameStore } from '@/lib/store';
import { Smartphone } from 'lucide-react';

/** ── P1.1 full-white/boot recovery ────────────────────────────────────
 *  A render error inside a game phase must never leave an unexplained blank
 *  white page. This boundary shows a controlled, visible fallback that names
 *  the failing phase and offers reload/return-to-menu. Errors are logged,
 *  not swallowed. The top-level ErrorBoundary in main.tsx still catches the
 *  rest of the tree; this one scopes recovery to the game shell. */
class GamePhaseErrorBoundary extends Component<
  { children: ReactNode; phase: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Keep the real error visible in the console — never silent.
    console.error(`[Abyssion] ${this.props.phase} phase crashed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-white p-8 text-center">
        <h1 className="text-xl font-bold text-amber-300">A subsystem failed to load</h1>
        <p className="text-sm text-gray-400 max-w-md">
          The {this.props.phase} view hit an unexpected error. Your saved progress is not affected.
        </p>
        <pre className="max-w-lg overflow-x-auto text-xs text-gray-500 bg-black/50 border border-gray-800 rounded p-3">
          {this.state.error.message || String(this.state.error)}
        </pre>
        <div className="flex gap-3">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-sm font-bold bg-amber-700 hover:bg-amber-600 text-white rounded"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-bold bg-stone-800 hover:bg-stone-700 text-amber-100 border border-amber-900/50 rounded"
          >
            Reload page
          </button>
        </div>
      </main>
    );
  }
}

export default function Game() {
  const [isPortrait, setIsPortrait] = useState(false);
  const gamePhase = useGameStore(s => s.gamePhase);
  const [fadeTrigger, setFadeTrigger] = useState(0);
  const [pendingPhase, setPendingPhase] = useState<typeof gamePhase | null>(null);
  const prevPhaseRef = useRef(gamePhase);

  // Runtime debug overlay (M1W3D3 #2): off by default, F9 toggles it. Transient
  // local state — never persisted, never written to the save. The listener is
  // added once on mount and removed on unmount; F9 is unused by every other
  // input handler in the app.
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        setShowDebugOverlay((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Trigger fade transition on major phase changes (loading→menu, menu→playing, playing→menu)
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = gamePhase;

    // Skip fade for the initial loading→menu transition (loading screen already has its own visual)
    if (prev === 'loading') return;

    // Only fade for meaningful transitions
    if (prev !== gamePhase) {
      setPendingPhase(gamePhase);
      setFadeTrigger((t) => t + 1);
    }
  }, [gamePhase]);

  const handleMidpoint = useCallback(() => {
    // The screen content swap happens here — React will render the new phase
    // while the screen is fully black. The pending phase has now been consumed,
    // so clear it: it must not latch across later transitions.
    setPendingPhase(null);
  }, []);

  const currentPhase = pendingPhase ?? gamePhase;

  if (currentPhase === 'loading') {
    return (
      <>
        <LoadingScreen />
        <FadeTransition
          trigger={fadeTrigger}
          durationMs={500}
          onMidpoint={handleMidpoint}
        />
      </>
    );
  }

  if (currentPhase === 'menu') {
    return (
      <>
        <MainMenu />
        <FadeTransition
          trigger={fadeTrigger}
          durationMs={500}
          onMidpoint={handleMidpoint}
        />
      </>
    );
  }

  return (
    <>
      {/* Strict 16:9 presentation: the game is a fixed 16:9 frame centred in
          the browser viewport. A wider/taller window gets black letterbox
          bars — the game is never stretched to a non-16:9 shape. All in-game
          HUD positioning continues to operate inside this frame because the
          gameplay UI is absolutely positioned relative to it. */}
      <main
        className="fixed inset-0 flex items-center justify-center overflow-hidden touch-none"
        style={{
          overscrollBehavior: 'none',
          // M1W2D3 #1 (WS1 — viewport HUD-fill): the area outside the 16:9
          // stage is framed in the game's own palette (the same warm
          // abyss/torchlit tones MainMenu and CreditsScreen use) plus a faint
          // HUD scanline texture, instead of pure black. A non-16:9 display
          // now reads a deliberate bezel rather than pillarbox bars. The
          // stage's aspect ratio, size and centring are untouched.
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(214,138,49,0.10) 0%, transparent 58%),' +
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px),' +
            'linear-gradient(180deg, #161a22 0%, #1b1712 55%, #221a12 100%)',
        }}
      >
        <div
          className="relative overflow-hidden bg-black"
          style={{
            aspectRatio: '16 / 9',
            // Feathered frame edge (WS1): the 16:9 stage glows softly into the
            // bezel with a hairline highlight, so no hard black edge is
            // visible where the stage ends.
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 0 42px 10px rgba(214,138,49,0.08)',
            width: '100vw',
            height: '56.25vw', // 100vw * 9/16 — wins when the window is wider than 16:9
            // 100dvh (dynamic viewport) with a vh fallback: on mobile browsers
            // with collapsing URL bars, vh overestimates the real viewport and
            // cropped the stage. min() guarantees the whole 16:9 frame fits.
            maxWidth: 'min(177.78vh, 177.78dvh)', // viewport * 16/9
            maxHeight: 'min(100vh, 100dvh)',
          }}
        >
        {isPortrait ? (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white p-8 text-center">
            <Smartphone size={64} className="mb-4 animate-bounce rotate-90" />
            <h2 className="text-2xl font-bold mb-2">Please Rotate Your Device</h2>
            <p className="text-gray-400">Abyssion is best played in landscape mode.</p>
          </div>
        ) : (
          <>
            {/* 3D Scene — scoped boundary: a scene crash shows the fallback,
                not a blank frame. */}
            <GamePhaseErrorBoundary phase="game world">
              <GameScene />
            </GamePhaseErrorBoundary>

            {/* Centre aiming dot (P1.8): exact centre of the 16:9 frame —
                NOT the browser viewport — so it stays centred when letterbox
                bars are present. Purely presentational, pointer-events-none,
                no gameplay input interaction. */}
            <div
              className="absolute left-1/2 top-1/2 z-10 pointer-events-none select-none"
              style={{ transform: 'translate(-50%, -50%)' }}
              aria-hidden
            >
              <div
                className="rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  background: 'rgba(232,213,174,0.9)',
                  border: '1px solid rgba(0,0,0,0.7)',
                  boxShadow: '0 0 3px rgba(0,0,0,0.8)',
                }}
              />
            </div>
          </>
        )}
        </div>

        {/* Gameplay HUD layer (M1W2D3 #1 WS1). A sibling of the 16:9 stage, so
            HUD elements position against the viewport and spread into the
            letterbox region on non-16:9 displays. The stage, its aspect ratio
            and the camera are untouched — every display shows the same 16:9
            world; only the HUD layout differs. Same z-10 layer as before, so
            it stays above the stage and below the modals. */}
        {!isPortrait && <UI />}

        {/* Damage vignette (M1W2D3 #1 WS2). Viewport-wide, and layered between
            the HUD and the modals: the z-20 wrapper sits above the HUD's z-10
            layer and below the lowest modal (z-40), and confines the
            component's own z-50 to its own stacking context. pointer-events
            none, so HUD buttons still receive input through it. */}
        {!isPortrait && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <DamageVignette />
          </div>
        )}

        {/* F-Mode strip (M1W3D3 #2 WS3). Sibling of the HUD root inside <main>,
            above the HUD (z-10) and vignette (z-20), below the lowest modal
            (z-40). Shown only while settings.fMode is on. Not part of Custom HUD. */}
        {!isPortrait && <FModeOverlay />}

        {/* In-game overlays. Siblings of the 16:9 stage, so their full-screen
            scrims resolve against the viewport instead of the stage's
            aspect-ratio box — which used to leave black pillarbox bars
            flanking them on displays that are not 16:9. The stage itself is
            unchanged. */}
        {!isPortrait && (
          <>
            <DialogueModal />
            <QuestLogModal />
            <InventoryModal />
            <ShopModal />
            <SettingsModal />
          </>
        )}

        {/* Runtime debug overlay (M1W3D3 #2). Sibling of the HUD root inside
            <main>; fixed z-[200] so it sits above every modal. Toggle: F9.
            pointer-events-none and a pure reader — it never eats input. */}
        {showDebugOverlay && <DebugOverlay />}
      </main>
      <FadeTransition
        trigger={fadeTrigger}
        durationMs={500}
        onMidpoint={handleMidpoint}
      />
    </>
  );
}

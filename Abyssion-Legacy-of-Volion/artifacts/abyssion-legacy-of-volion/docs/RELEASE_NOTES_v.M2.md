## v.M2 — Investor Release Note

### 1. What this is

Abyssion: Legacy of Volion is a fantasy action game that runs in a web browser with nothing to
install. The player controls a character in a third-person world, fights enemies with several
weapons and spells, and moves between distinct regions — a village, a wilderness and a more
dangerous area — each of which behaves differently. This note describes exactly what the build
frozen at tag `v.M2` contains, and exactly what it does not.

### 2. What is in v.M2

**Gameplay**

- A third-person character whose movement blends between idle and walking over a tenth of a
  second instead of snapping between the two poses (`src/components/game/Player.tsx`).
- Several weapons, including a lever-action rifle and a crossbow, plus a spell system
  (`src/lib/spellRunner.ts`). Impacts briefly stop the action and shake the camera
  (`src/components/game/Player.tsx`).
- Enemies to fight, and a full-screen death and respawn view (`src/components/game/GameHUD.tsx`).
- An explorable map with a full-screen map view, a quest tracker and a minimap
  (`src/lib/minimap.ts`, `src/lib/encounterConfig.ts`).

**Systems**

- A thirty-minute in-game day that cycles continuously: the sun moves, and the light, the fog and
  the sky follow it from dawn through day, dusk and night (`src/components/game/GameScene.tsx`).
- Fog that differs per region — the village, the wilderness and the dangerous area each have their
  own fog thickness and colour, so distance reads differently in each place (`GameScene.tsx`).
- Wildlife that moves through the world on its own, from 32 seeded instances, so the same animals
  appear in the same places on every run (`function AmbientLife`, `GameScene.tsx`).
- An in-game editor that lets the player rearrange and save the mobile skill buttons and the
  desktop hotbar (`src/lib/hudConfig.ts`, `src/components/game/UI.tsx`).

**Presentation**

- A written art direction document that fixes the palette, lighting, outlines and post-processing
  rules the project now follows (`docs/art-spec.md`).
- A post-processing chain that draws the frame at reduced resolution with a pixelation effect and
  adds glow to the brightest areas (`function PostProcessing`, `GameScene.tsx`, using the
  `postprocessing` library, added in this cycle).
- An outline pass that draws a dark edge around shaded objects (`OutlineEffect`, `GameScene.tsx`).
- An on-screen diagnostics overlay reporting frame rate, frame time and memory while the game runs
  (`src/components/game/DebugOverlay.tsx`).

### 3. What changed since v.M1

- The world gained a clock. Where v.M1 had a fixed hour of daylight, the sun, the fog and the sky
  are now all driven by one thirty-minute day cycle (`GameScene.tsx`). A reader can open the game
  and watch the light change.
- Movement and combat stopped double-stepping. Spells were being advanced twice per frame, the
  lever-action rifle could swallow or latch a click, and the rifle and crossbow could fire from the
  same input; each has been corrected (`updateSpells` and the rifle handling in
  `src/components/game/Player.tsx`).
- The world and the image gained layers. Trees and rocks were added to the wilderness, wildlife was
  added to the whole world, and a lost render path was restored so world effects draw again
  (`GameScene.tsx`, `src/components/game/WorldFX.tsx`).
- The image pipeline was rebuilt. The frame is now composited through a pixelation pass, a glow
  pass and an outline pass instead of being drawn directly (`function PostProcessing`,
  `OutlineEffect`, `GameScene.tsx`).

### 4. What is not yet done

- **No runtime verification has been performed on this build.** Everything below is established by
  reading the code and by a successful compile and build, not by playing the game.
- **Four known defects are still open**, each waiting on a runtime pass to confirm the cause:
  FAIL-3, BUG-105, BUG-106 and BUG-107.
- **BUG-101 is not a game defect.** It is a 502 error returned by the preview proxy on the hosting
  platform; the game code is not involved.
- **The cel-shaded character look (work item F8a) has not been started.** Characters currently use
  standard shading, not the flat illustrated style that `docs/art-spec.md` specifies.
- **The outline treats the world too broadly.** It is applied to every shaded object rather than to
  characters and weapons only, so scenery is outlined as well.
- **Night currently has no stars.** The star field specified for the night band was not created, so
  night renders as a flat dark colour.
- **Weapon impact effects are partial.** The hit-stop and camera shake are in place; the weapon
  trail is not finished.

### 5. Current build status

- Compiles: yes
- Builds: yes
- Static validation: PASS
- Runtime verification: not performed
- Frozen at tag: v.M2
  (the tag itself records the exact commit it points
   to; consult the tag metadata)

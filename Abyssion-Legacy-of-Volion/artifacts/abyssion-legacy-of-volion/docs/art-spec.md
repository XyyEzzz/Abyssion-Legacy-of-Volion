# Art Spec — Pixelated Semi-Stylized

Technical art spec for **Abyssion: Legacy of Volion**. This document is the
authoritative direction for every art-implementation session that follows. It is
prescriptive: every rule below is a must, with a concrete number, hex value, or
named library. A future session reads this file and implements it directly.

Scope of this document is exactly §1–§11. Nothing else is authorized.

---

## §1 Style statement

The art style is **Pixelated Semi-Stylized**. The reference feel is the anime
look of WuWa / Genshin / Honkai Impact 3rd — readable silhouettes, strong
value separation, cel-shaded character shading — rendered through a pixelated
lens whose concrete atmosphere anchors are **Signalis**, **Darkwood**,
**Hyper Light Drifter**, and **Fear & Hunger**: limited palette, hard edges,
dither instead of smooth gradients, fog as the primary depth cue, and horror
imagery held in a narrow desaturated range rather than in saturation. The
pixelation is not decoration — it is the performance strategy: every surface is
shaded with 3 flat cel bands, every texture is 96×96 px, and the whole scene is
rasterised into a half-resolution buffer, so the game holds its frame budget on
low-end hardware (Helio G70-class, Mali-G52 MC2) instead of buying detail it
cannot afford. **The style is uniform across the entire game**: the world,
characters, NPCs, enemies, weapons, wildlife, VFX, HUD, menus, and cutscene
presentation all use the same shader model (§2), the same outline rule (§3), the
same 96×96 px texture cap (§4), and the same 16-colour palette (§5). There is no
"combat style", no "menu style", and no per-zone art variant. One build, one
look, every device.

---

## §2 Shader model

**Base.** Cel / Toon shading is the base model for every lit surface.
Implementation: `MeshToonMaterial` driven by a shared 3×1 px **gradient map**
(`DataTexture`, `NearestFilter`, no mipmaps) whose texels are **0.45 / 0.78 /
1.00**, multiplied by the material's `color` (a palette slot from §5).

**Tone bands.** Exactly **three bands per surface**: shadow, mid, light. The band
split is implied by the 3-texel gradient map at **N·L = 0.333** and **N·L =
0.667** — hard threshold, **never `smoothstep`**, never a blurred gradient map,
never a 4th band. The transition between bands is one texel wide, which is what
produces the read.

**Light response.** `MeshToonMaterial` (or the equivalent custom `ShaderMaterial`)
must keep `fog: true` so E2's `FogExp2` still applies, and `toneMapped: true` for
all world surfaces. Band 0 (0.45) is the floor: no lit world surface may render
below 45 % of its albedo from the cel term alone, so the shadow band stays
readable through E2's fog.

**Semi-PBR accent (not a base).** Physically-based specular response is added
**only** on these three surface classes, and on nothing else:

1. **Metal weapons** — the M1887 barrel and receiver, the sword crossguard, and
   the dagger blade.
2. **Water** — the water staff's orb, and any river/lake surface if one is ever
   authored.
3. **The Resonance Core** — the core item and its in-world emissive mesh.

Everything else — terrain, props, buildings, trees, rocks, all character and NPC
bodies, clothing, hair, wildlife, HUD geometry — uses flat cel shading with **no
specular term**.

**Accepted implementation approaches.** Two, and only two:

- **A. `MeshToonMaterial` + `gradientMap`** — the default for every flat-cel
  surface (all surfaces not in the accent list above).
- **B. Custom `ShaderMaterial`** — permitted only for the three accent surface
  classes, where the cel bands are combined with one specular lobe
  (Blinn-Phong exponent **N = 32**, specular intensity **≤ 0.35**). A
  `MeshStandardMaterial` may be kept and the cel band injected through
  `onBeforeCompile` — this counts as approach B and carries the same limits.

No other shading model is permitted. In particular: **no** `MeshPhysicalMaterial`,
**no** clearcoat, **no** subsurface scattering, **no** anisotropic or
iridescence extensions, and **no** PBR on any surface outside the three accent
classes. No library is chosen by this spec.

---

## §3 Outline

**Thickness rule.** The outline is **2 px on a 1920×1080 viewport**, and scales
linearly with viewport height:

```
t_vpx = clamp(2.0 * (viewportHeight / 1080), 1.0, 3.0)
```

Resulting widths:

| viewport | outline (display px) |
| --- | --- |
| 1280×720 | 1.33 |
| 1920×1080 | 2.00 |
| 2560×1440 | 2.67 |
| ≥ 1620p tall | 3.00 (clamped) |
| ≤ 540p tall | 1.00 (clamped) |

**Hard bounds.** The displayed outline is **never thinner than 1 px and never
thicker than 3 px**, at any viewport, on any device. Because §6 rasterises the
scene into a half-resolution buffer and upscales with nearest-neighbour, the
hull extrusion is applied in buffer space as `t_vpx * internalScale` and is
never thinner than **1 buffer pixel** (a sub-pixel line aliases and would break
the uniform-thickness lock). At 1080p that is exactly 1 buffer px = 2 display px.

**Colour.** A fixed dark tone: **`#1A1410`**. Not pure black (`#000000`), not
`#111111`, not a per-object tint. `MeshBasicMaterial`, `toneMapped: false`,
`fog: false`.

**Style.** Uniform thickness on every outlined edge. **No distance-based
tapering**, no distance fade-out, no thickness variation by object size, no
per-vertex thickness. This is a stylistic lock taken from the reference games
(Signalis, Hyper Light Drifter): the outline reads as a drawn line, not as a
fresnel falloff.

**Applied to.** Every **character** (player, all NPCs, all enemies) and every
**weapon** (sword, dagger, M1887, crossbow, water staff, resonance core).
**Not applied to** environment props, trees, rocks, houses, ground, the arena
geometry, wildlife, VFX meshes, or the fogged distance.

**Implementation — three candidate approaches, one chosen:**

- **A. Inverted hull** — a duplicate of the mesh, `side: THREE.BackSide`,
  vertices pushed out along the normal, one extra draw call per outlined object.
- **B. three's `OutlinePass`** — a post-process pass from
  `examples/jsm/postprocessing`, driven by `EffectComposer`.
- **C. Post-process edge detect** — a Sobel/edge filter over a depth + normal
  prepass.

**Chosen: A, the inverted hull.** Reasons, in order:

1. Thickness is authored in **buffer** pixels, so the 1 buffer px extrusion
   upscales to exactly 2 display px at 1080p with no anti-aliased edge. `OutlinePass`
   authors thickness in viewport pixels and would produce a smooth line that the
   pixelate stage then has to re-quantise.
2. Selection is **per-object**, so "characters and weapons only" is structural.
   B and C are screen-space and would need an explicit mask to exclude props,
   ground, and the fogged distance.
3. Cost is **one extra draw call per outlined object** and no additional render
   target, which fits the ≤ 2 ms outline budget in §10. B requires
   `EffectComposer` plus a second full render of the selected objects; C requires
   a depth+normal prepass at buffer resolution.
4. It needs no post-processing dependency, so §6's two-effect lock cannot be
   broken by an outline library.

**Hull material spec.** `MeshBasicMaterial`, `color: #1A1410`,
`side: THREE.BackSide`, `fog: false`, `toneMapped: false`, `depthWrite: true`.
Vertex offset: `position += normalize(normal) * t_bufferPx * (2.0 / bufferHeight) * clipW`,
which keeps the extrusion constant in screen space regardless of depth.

---

## §4 Texture resolution

**Every texture in the game is 96×96 px.** This is a hard cap, not a target.

| asset class | size |
| --- | --- |
| tiled material (ground, walls, bark, rock, cloth) | 96×96 px |
| atlas | 96×96 px **per tile slot** |
| UI icon | 96×96 px (scaled down to display size) |
| character skin / clothing | 96×96 px **per body part** |
| sky gradient | 96×96 px |
| star field (night sky) | 96×96 px |
| toon gradient map (§2) | 3×1 px |

**Hard cap, not a target.** Devices never load an asset larger than 96×96 px.
There is no 192×192 "hero" exception, no 512×512 sky, and no 256×256 atlas. A
future session that needs more detail adds more 96×96 tiles; it does not raise
the number.

**Filtering.** `THREE.NearestFilter` on **every** texture's `magFilter` and
`minFilter`. No `LinearFilter`, no `LinearMipmapLinearFilter`, no anisotropy
(`texture.anisotropy = 1` on all textures). This is what gives the pixelated
reading at native resolution.

**Mipmaps.** **Off** for tiled materials (`generateMipmaps = false`, minFilter
`NearestFilter`) — they are sampled near 1:1 against the 96 px tile and mipmaps
would only add sampling blur. **On** for atlased UI
(`generateMipmaps = true`, minFilter `NearestMipmapNearestFilter`) because UI is
displayed far below 1:1.

**Wrapping.** `RepeatWrapping` for tiled materials, `ClampToEdgeWrapping` for
atlases, icons, the sky gradient, and the star field. Never `MirroredRepeatWrapping`.

**Colour space.** `SRGBColorSpace` for albedo/UI textures. `NoColorSpace`
(linear) for masks, the star-field alpha, and the §2 gradient map.

**Current state.** The tree holds **0 textures** on 3D meshes today — every
material is a flat colour. The first implementation session authors the 96×96 px
set from scratch under this cap.

---

## §5 Palette

The palette is free within a bounded structure. There are exactly **16 slots**.
Every material is assigned one of the 16; no material may use a colour outside
this table.

**The 16-colour table (verbatim):**

| slot | hex | H | S | V | role |
| --- | --- | --- | --- | --- | --- |
| W1 | `#E8B86B` | 37° | 0.539 | 0.910 | warm light — sunlight, fire, butterflies |
| W2 | `#D9A05B` | 33° | 0.581 | 0.851 | warm mid — timber, cloth, village trim |
| W3 | `#C98A4B` | 30° | 0.627 | 0.788 | warm mid-dark — thatch, rope, sandstone |
| W4 | `#A8743C` | 31° | 0.643 | 0.659 | warm dark — ploughed earth, market wood |
| W5 | `#8C5A33` | 26° | 0.636 | 0.549 | warm deep — wet soil, forge scale |
| W6 | `#6E4A2E` | 26° | 0.582 | 0.431 | warm shadow — dry bark, leather |
| C1 | `#3F4A55` | 210° | 0.259 | 0.333 | cold mid — stone, slate, arena wall |
| C2 | `#2E3945` | 211° | 0.333 | 0.271 | cold dark — night rock, dead wood |
| C3 | `#5A6B78` | 206° | 0.250 | 0.471 | cold light — misted stone, bone-grey cloth |
| C4 | `#1F2A33` | 207° | 0.392 | 0.200 | cold deep — crows, abyss, distant movers |
| C5 | `#56604F` | 95° | 0.177 | 0.376 | sickly moss — swamp growth, thornback hide |
| C6 | `#6B5A46` | 32° | 0.346 | 0.420 | sepia — Dangerous Territory ground, ruin dust |
| U1 | `#D9B48C` | 31° | 0.355 | 0.851 | universal skin |
| U2 | `#762B2B` | 0° | 0.636 | 0.463 | universal blood |
| U3 | `#E6E1D8` | 39° | 0.061 | 0.902 | universal UI |
| U4 | `#4A4A4A` | 0° | 0.000 | 0.290 | universal neutral |

**Zone subsets.** Six slots are warm, six are cold, four are universal:

- **Village Haven** pulls from the **warm 6** — `W1`–`W6` — plus the universal 4.
- **Dangerous Territory** and the **unnamed wilderness** pull from the **cold 6**
  — `C1`–`C6` — plus the universal 4.
- The **universal 4** (`U1` skin, `U2` blood, `U3` UI, `U4` neutral) may appear in
  every zone.

**The outline colour `#1A1410` (§3) is not a palette slot.** It is exempt and is
the only near-black in the game.

**Saturation rule.** Every colour in the table satisfies **S ≤ 0.65 in HSV** and
**0.12 ≤ V ≤ 0.92**. Both bounds are verified for all 16 slots above. Any new
colour proposed for any purpose must satisfy both before it is used.

**Forbidden combinations** — each is a hard rule, stated as the user specified:

- **No neon hair.** No hair, fur, or feather material may exceed S = 0.65; hair
  is drawn from `W4`–`W6`, `C1`–`C4`, or `U4`.
- **No sky-blue body.** No body, skin, cloth, or armour surface may use a hue
  between 185° and 215° at V > 0.5. `#87CEEB` (the current static background
  clear colour, GameScene.tsx:1018) is out of spec as a material colour and is
  removed by §8.
- **No purple shadows.** Shadow bands come from the gradient map (§2), never from
  a hue shift. No material may tint its own shadow band; shadow hue must equal
  base hue for every surface.

---

## §6 Post-processing

Exactly **two** effects, in this order. No third effect is authorized.

**a. Dither / pixelate.**

- The scene renders into a render target at **`internalScale = min(0.5, 1280 / viewportWidth)`**
  of the viewport — a half-resolution buffer, hard-capped at 1280 px wide.
- The composite pass upscales that buffer to the viewport with
  **nearest-neighbour** sampling (`NearestFilter`, no linear upscale).
- At the upscale stage the composite applies **ordered dithering on a 4×4 Bayer
  matrix**, amplitude **1/255** (1 LSB of the 5-bit-per-channel output).
- The renderer pixel ratio is **1** (`setPixelRatio(1)`). The upscale, not the
  device pixel ratio, is what makes the image pixelated.

**b. Bloom.**

- Threshold **0.85**, intensity **0.3**, radius **0.6**.
- **Applied after the pixelate stage**, so the glow is quantised to the same
  pixels as everything else. This is deliberate and is the stylistic lock: the
  game reads as a **horror film with an analogue glow**, not as an anime bloom
  pass. Bloom must never be inserted before the pixelate stage.
- Implementation is the cheap `UnrealBloomPass` equivalent with a capped radius:
  a 4-level mip chain starting at **0.25× viewport**, radius clamped at 0.6,
  intensity 0.3, threshold 0.85.

**Forbidden post-process effects — each is banned by name** so no future session
adds one: **chromatic aberration**, **vignette**, **film grain**, **motion
blur**, **SSAO / ambient occlusion**, **depth of field**, **temporal
anti-aliasing (TAA)**, **FXAA / SMAA**, **colour grading / LUTs**, **god rays**,
and **any other `EffectComposer` pass not listed in (a) or (b)**. Anti-aliasing
is explicitly banned in every form: it smooths exactly the edges the style is
built on.

**Library intent (not installed in this session).** The implementation session
adopts **`postprocessing`** with the **`@react-three/postprocessing`** React
binding: it provides the half-resolution render target, a `BloomEffect` with
exact threshold/intensity/radius parameters, and a custom `Effect` for the Bayer
upscale in one pipeline. Fallback if that is rejected: **three's built-in
`examples/jsm/postprocessing`** (`EffectComposer`, `RenderPass`, `ShaderPass`,
`UnrealBloomPass`) driven from a `useFrame`-free `useEffect` setup. No package is
installed by this spec session.

**Performance.** Pixelate is performance-positive (it renders at ≤ 0.5×). Bloom is
the only added full-screen cost and is capped by the 0.25× mip start and the 0.6
radius. Together they must fit §10's ≤ 2 ms bloom line.

---

## §7 Per-zone mood table

Zone is resolved by **E2's single resolver** — `zoneAt(x, z)` in
`src/components/game/GameScene.tsx` (arena rect = `dangerous`, nearest authored
landmark = `village`, otherwise `wilderness`). This spec adds no second resolver
and does not invent fog numbers: **every fog value below is E2's existing value,
unchanged**.

| zone | fog density multiplier | fog colour tint | ambient floor | sun intensity multiplier | palette subset | allowed wildlife mood |
| --- | --- | --- | --- | --- | --- | --- |
| **Village Haven** | **0.85** | `#C9A47A` (warm) | **0.10** | **1.00** | warm 6 + universal 4 | warm, alive, small and safe — butterflies, perched birds, ground cats |
| **Dangerous Territory** | **1.25** | `#4A4A44` (desaturated grey) | **0.10** | **0.85** | cold 6 + universal 4 | sparse, unsettling — crows on the arena walls, thin cats |
| **Unnamed wilderness** | **1.10** | `#35383A` (cold dark grey) | **0.10** | **0.75** | cold 6 + universal 4 | sparse and wrong — crows, distant movers, rats |
| **Interior** | **0.00** | none | **0.10** | **0.00** | warm 6 + universal 4 | none |

Derivation of each column, from E2 as it stands today:

- **Fog density multiplier** — E2's `FOG_ZONE_DENSITY` (`village: 0.85`,
  `dangerous: 1.25`, `wilderness: 1.10`) over E2's `FOG_BASE_DENSITY = 0.015`,
  producing effective densities **0.01275 / 0.01875 / 0.01650**, and
  **0.01530 / 0.02250 / 0.01980** at night under E2's
  `FOG_NIGHT_DENSITY_SCALE = 1.2`.
- **Fog colour tint** — E2's `FOG_ZONE_COLOR` (`0xC9A47A / 0x4A4A44 / 0x35383A`),
  with E2's `FOG_NIGHT_COLOR_SCALE = 0.5` applied to the colour at night. E2's
  `FogExp2` is the only fog in the scene; no second fog is added.
- **Ambient floor** — `0.10`, E2's `ambientAtHour` night band (`hour < 6` →
  0.10), which is the minimum ambient intensity over a full cycle in every zone.
  The complete E2 band table this spec references: 0–6 h → 0.10; 6–8 h →
  0.30→0.55; 8–18 h → 0.55→0.75; 18–20 h → 0.55→0.30; 20–30 h → 0.30→0.10.
- **Sun intensity multiplier** — new art values applied on top of E2's baseline
  directional light intensity **1.5**: the haven keeps E2's full sun (×1.00),
  the Dangerous Territory softens it (×0.85), the wilderness softens it further
  (×0.75). *Fog numbers are E2's and are not touched; only the sun multiplier is
  new art direction.*
- **Interior** — E2 already zeroes fog indoors (`fogSuppressed` → `density = 0`).
  The spec locks that as **fog = 0**, adds **sun = 0** (the directional light
  contributes nothing inside), and states that the interior is lit by **E2's
  interior point light** (`position [40, 3.4, 40]`, `intensity 18`,
  `distance 12`, `color #FFD9A0`, `castShadow false`,
  GameScene.tsx:1398) plus E2's ambient band value only.
- **Palette subset** — §5.
- **Allowed wildlife mood** — the implemented E3b ambient wildlife set, unchanged.
  Wildlife count caps stay as shipped: 13 in Village Haven, 5 in the Dangerous
  Territory rect, 14 in the unnamed wilderness.

---

## §8 Sky + background

The sky is currently static (a drei `<Sky sunPosition={[10, 20, 10]} />` element
plus a fixed `<color attach="background" args={['#87CEEB']} />` at
GameScene.tsx:1018 / :1031). **This spec replaces both** and locks the rule. The
sky follows **E2's `dayProgress`** (the single time-of-day source in
`DayNightCycle`), from which `hour = (6 + dayProgress * 30) mod 30`.

**Bands.**

| band | in-game hours | top colour | horizon colour | texture |
| --- | --- | --- | --- | --- |
| day | 8–18 | **`#6E88A6`** | **`#A8A08A`** | 96×96 px two-tone vertical gradient |
| dawn / dusk | 6–8 and 18–20 | **`#5A4A55`** | **`#C9A47A`** | 96×96 px two-tone vertical gradient |
| night | 20–30 and 0–6 | **`#1A1F2A`** (flat) | **`#1A1F2A`** (flat) | 96×96 px star-field texture, **no gradient** |

**Implementation.** One full-screen sky quad (or skybox face) textured with the
96×96 px gradient, `NearestFilter`, `ClampToEdgeWrapping`,
`toneMapped: false`, `fog: false`, sampled along the view-relative vertical axis
so the horizon colour lands exactly at the horizon line. The night star field is
the same quad with a 96×96 px star texture, `color #1A1F2A` as its base,
`transparent: true`, `opacity = 1` during the night band and `0` otherwise.

**Transitions.** Band colours are lerped every frame toward the current band's
target using an exponential smoother with time constant **τ = 2 s**, so a band
change resolves fully in about **6 s**. The star-field opacity uses the same
τ = 2 s. This is a continuous, allocation-free lerp into the sky material's
existing colour uniforms — no per-frame `Color` or `Vector3` allocation.

**Background clear colour.** `renderer.setClearColor` (i.e. `<color
attach="background">`) is set to the **horizon colour of the current band** —
`#A8A08A` by day, `#C9A47A` at dawn/dusk, `#1A1F2A` at night — so a fogged
distance never terminates on a hard line against the sky.

**Not authorized in the sky:** no clouds, no sun disc sprite, no moon sprite, no
lens flare, no volumetric scattering, no cubemap environment map, no
`Sky`-style Preetham scattering model. The sky is a two-tone gradient plus a star
field, and nothing else.

---

## §9 Material swap plan

Audit of the class census in this tree (`src/components/game`, excluding
`src/components/ui/**`): **225 material references** —
`meshStandardMaterial` **182** (175 JSX tags + 7 imperative/type references),
`meshBasicMaterial` **29** (16 JSX tags + 13 imperative/type references),
`meshLambertMaterial` **14** (all JSX tags, all introduced by the E3b ambient
wildlife block). **`meshToonMaterial` and `gradientMap`: 0 today.** This section
enumerates material **classes** and their swap rule; it does not enumerate files.

| existing class | refs | target after implementation | rule |
| --- | --- | --- | --- |
| `MeshBasicMaterial` | 29 | **`MeshBasicMaterial`** (unchanged) | The cel shader is not a drop-in replacement for an unlit material, so the swap is deferred to an implementation session. See the change list below. |
| `MeshLambertMaterial` | 14 | **`MeshToonMaterial`** | Replace 1:1. `color` = the material's assigned **palette slot** (§5); `gradientMap` = the shared 3×1 map (§2); drop `roughness`-style hints — a toon material has none. |
| `MeshStandardMaterial` | 182 | **`MeshToonMaterial`** | Replace 1:1 with the same `color` → palette slot and the shared `gradientMap`, **except** the three semi-PBR accent classes in §2 (metal weapons, water, the Resonance Core), which keep a physically-based specular lobe with the cel bands injected (implementation approach **B** in §2). |

**`MeshBasicMaterial` change list** (this is the deferred swap's contents —
listed now so the implementing session does not have to re-derive it):

- **Changes to `MeshToonMaterial`** (unlit today but sitting on a lit world
  surface): the E3b butterfly wing quads (2 tags, GameScene.tsx) and the SlimeEnemy
  shockwave ring (1 tag, `enemies/SlimeEnemy.tsx:193`).
- **Stays unlit `MeshBasicMaterial`**: the E3b distant-mover box (1 tag,
  GameScene.tsx), the player's weapon-trail and glow planes (6 tags, Player.tsx),
  the NPC eye/face planes (2 tags, NPC.tsx), the WorldFX particle and spark
  meshes (3 tags, WorldFX.tsx), and the EncounterArea entrance marker (1 tag,
  EncounterArea.tsx). These are light-independent by design; converting them to
  a lit model would change their read.
- **New `MeshBasicMaterial`**: the §3 outline hull.

**Swap order for the implementing session.** (1) author the palette module (§5),
(2) author the 3×1 gradient map (§2), (3) swap `MeshLambertMaterial` first — it
is 14 tags and validates the toon look, (4) swap `MeshStandardMaterial` class by
class, (5) apply the `MeshBasicMaterial` change list, (6) add the outline hull,
(7) add §6's two post-process effects, (8) replace the sky (§8). Nothing in this
plan changes geometry or animation — see §11.

---

## §10 Performance budget

**Target: 60 fps on a Helio G70-class device (Mali-G52 MC2), 1080p external
viewport.** Frame time budget: **16.6 ms**.

| stage | budget |
| --- | --- |
| scene render at half-res | **≤ 6.0 ms** |
| bloom | **≤ 2.0 ms** |
| outline pass | **≤ 2.0 ms** |
| physics (Rapier) | **≤ 3.0 ms** |
| gameplay + animation | **≤ 2.0 ms** |
| HUD | **≤ 1.0 ms** |
| **total** | **≤ 16.0 ms** (0.6 ms headroom against 16.6 ms) |

**Named hard limits:**

- **Draw calls ≤ 120.**
- **Triangles ≤ 150 k.**
- **Texture memory ≤ 24 MB** resident. At 96×96 px RGBA8 = 36,864 B per texture
  (`generateMipmaps = false` for tiled), that is **≤ 680 distinct 96×96 textures**.
  The **1024×1024 shadow map counts against this ceiling at 4.0 MB**.
- **Shadow map: 1024×1024, unchanged from E2** (`shadow-mapSize={[1024, 1024]}`,
  ortho `shadow-camera-left = -20`, `right = 20`, `top = 20`, `bottom = -20`,
  GameScene.tsx:1025–1029).
  Shadow settings are not re-tuned by this spec and are not raised.
- **Internal render resolution:** `internalScale = min(0.5, 1280 / viewportWidth)`;
  the scene buffer **never exceeds 1280×720**. At a 1920×1080 external viewport
  that is a 960×540 scene buffer.
- **Renderer pixel ratio: 1.** Cascaded shadow maps, MSAA (`antialias: true`),
  and any form of temporal accumulation are all banned under this budget.

---

## §11 Non-goals

This spec does **not** authorize any of the following. Each item is out of scope
until a future spec session changes this document:

- **No rigged or skinned character animation.** Character animation stays locked
  to the procedural transform-write system from M1W3D1 B5 (per-frame
  `rotation.set` / `position` writes on primitives). No skeleton, no
  `SkinnedMesh`, no `AnimationMixer`, no glTF animation clips.
- **No high-detail character models.** Character and NPC meshes keep their
  current primitive construction and vertex counts. This spec changes shading,
  not silhouette complexity.
- **No photoreal materials.** No `MeshPhysicalMaterial`, no measured BRDFs, no
  real photographic source textures, no normal-map detail sculpting.
- **No real-time global illumination.** No GI probe, no irradiance volume, no
  SSGI, no ray-traced lighting, no dynamic lightmap baking.
- **No post-process beyond §6.** Two effects only — the half-res pixelate/dither
  composite and the capped bloom. The §6 forbidden list is absolute.
- **No per-platform art variants.** One build serves every device. No "low"
  texture tier, no mobile-only material set, no desktop-only post-process chain,
  no quality dropdown that changes the art.
- **No 4K textures anywhere.** 96×96 px per material is the hard cap (§4); there
  is no 4K texture, no 2K texture, and no 192×192 exception.
- **No runtime texture streaming.** All 96×96 px textures are loaded up front
  with the bundle. No `TextureLoader` at runtime, no progressive/lazy texture
  loading, no per-zone texture swap, no eviction or cache management.

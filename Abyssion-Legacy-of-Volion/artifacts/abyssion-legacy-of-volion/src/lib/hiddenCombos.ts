/**
 * Hidden movement-combination cheatcodes.
 *
 * Sequences of at least 4 distinct gameplay actions (move/jump/sprint/
 * attack/dodge/shield) that trigger the project's existing cheat effects.
 * Deliberately undocumented in the UI so they stay easter-eggs; the effect
 * itself is surfaced by the same notifications as the developer console.
 * Extracted from UI.tsx — pure data + matching logic, no React.
 */

// ── Hidden movement-combination cheatcodes ─────────────────────────
// Sequences of at least 4 distinct gameplay actions (move/jump/sprint/
// attack/dodge/shield) that trigger the project's existing cheat effects.
// Deliberately undocumented in the UI so they stay easter-eggs; the effect
// itself is surfaced by the same notifications as the developer console.
export const HIDDEN_COMBO_TIMEOUT_MS = 4000;

export const HIDDEN_COMBOS: { id: string; tokens: string[]; command: string }[] = [
  { id: 'GODMODE', tokens: ['DODGE', 'SHIELD', 'JUMP', 'ATTACK'], command: 'GODMODE' },
  { id: 'HEALME', tokens: ['SPRINT', 'JUMP', 'SHIELD', 'DODGE'], command: 'HEALME' },
  { id: 'GIVEGOLD', tokens: ['ATTACK', 'DODGE', 'SPRINT', 'MOVE', 'JUMP'], command: 'GIVEGOLD 500' },
  { id: 'XPBOOST', tokens: ['JUMP', 'SPRINT', 'ATTACK', 'SHIELD', 'MOVE'], command: 'XPBOOST 3000' },
  { id: 'RESETTEST', tokens: ['SHIELD', 'MOVE', 'DODGE', 'ATTACK', 'SPRINT'], command: 'RESETTEST' },
  { id: 'TPARENA', tokens: ['MOVE', 'ATTACK', 'JUMP', 'SPRINT', 'DODGE'], command: 'TPARENA' },
  { id: 'TPFORGE', tokens: ['DODGE', 'JUMP', 'SPRINT', 'SHIELD', 'ATTACK'], command: 'TPFORGE' },
  { id: 'ABYSSION', tokens: ['MOVE', 'JUMP', 'SPRINT', 'ATTACK', 'DODGE', 'SHIELD'], command: 'ABYSSION' },
  { id: 'ZORO', tokens: ['ATTACK', 'SPRINT', 'MOVE', 'JUMP', 'SHIELD', 'DODGE'], command: 'ZORO' },
  { id: 'KYO', tokens: ['JUMP', 'DODGE', 'ATTACK', 'SPRINT', 'SHIELD', 'MOVE'], command: 'KYO' },
];

// Longest combos first so a longer exact match wins over its own suffix.
const HIDDEN_COMBOS_LONGEST_FIRST = [...HIDDEN_COMBOS].sort((a, b) => b.tokens.length - a.tokens.length);

export function eventToComboToken(e: KeyboardEvent): string | null {
  switch (e.code) {
    case 'KeyW':
    case 'KeyA':
    case 'KeyS':
    case 'KeyD':
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      return 'MOVE';
    case 'Space':
      return 'JUMP';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'SPRINT';
    case 'KeyJ':
      return 'ATTACK';
    case 'KeyK':
      return 'DODGE';
    case 'KeyF':
      return 'SHIELD';
    default:
      return null;
  }
}

/**
 * Feed a combo token into the buffer and return the matched cheat command
 * (or null). Handles timeout reset, buffer capping and longest-match-first.
 */
export function feedComboToken(
  buffer: string[],
  token: string,
  lastInputAt: { current: number },
  now: number,
): string | null {
  if (now - lastInputAt.current > HIDDEN_COMBO_TIMEOUT_MS) {
    buffer.length = 0;
  }
  lastInputAt.current = now;
  buffer.push(token);
  // Cap the buffer so casual play never grows it unbounded; only the
  // tail participates in matching.
  if (buffer.length > 16) {
    buffer.splice(0, buffer.length - 16);
  }
  for (const combo of HIDDEN_COMBOS_LONGEST_FIRST) {
    if (buffer.length >= combo.tokens.length) {
      const tail = buffer.slice(-combo.tokens.length);
      if (tail.every((tok, i) => tok === combo.tokens[i])) {
        buffer.length = 0;
        lastInputAt.current = 0;
        return combo.command;
      }
    }
  }
  return null;
}

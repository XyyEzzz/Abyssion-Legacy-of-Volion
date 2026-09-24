/**
 * Combat audio event hooks.
 *
 * No real sounds are played yet — these are typed no-op stubs that
 * define the exact call sites so audio assets can be dropped in
 * later without touching combat controller logic.
 *
 * To connect real sounds: replace the function bodies with calls to
 * your audio system (e.g. a Howl play, Web Audio buffer source, or
 * three-positional-audio listener).
 */

export type CombatAudioEvent =
  | 'swing'
  | 'hit'
  | 'block'
  | 'enemyDeath';

export interface SwingParams {
  comboStage: 1 | 2 | 3;
}

export interface HitParams {
  comboStage: 1 | 2 | 3;
  enemyName: string;
  position: [number, number, number];
}

export interface BlockParams {
  position: [number, number, number];
}

export interface EnemyDeathParams {
  enemyName: string;
  position: [number, number, number];
}

export const combatAudio = {
  swing(params: SwingParams): void {
    // playSwingSound(params.comboStage)
    void params;
  },

  hit(params: HitParams): void {
    // playHitSound(params.comboStage, params.position)
    void params;
  },

  block(params: BlockParams): void {
    // playBlockSound(params.position)
    void params;
  },

  enemyDeath(params: EnemyDeathParams): void {
    // playDeathSound(params.enemyName, params.position)
    void params;
  },
};

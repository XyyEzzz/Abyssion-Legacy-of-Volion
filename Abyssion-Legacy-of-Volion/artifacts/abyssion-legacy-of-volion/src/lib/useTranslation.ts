'use client';

import { useGameStore } from './store';
import { t, Lang } from './translations';

/**
 * Hook that returns a translation function bound to the current language setting.
 * Usage: const { tl } = useTranslation(); tl('hud.heal') → "Heal" or "Sembuh"
 */
export function useTranslation() {
  const lang: Lang = useGameStore((s) => s.settings.language) as Lang;

  const tl = (key: string, values?: Record<string, string | number>) => t(key, lang, values);

  return { tl, lang };
}

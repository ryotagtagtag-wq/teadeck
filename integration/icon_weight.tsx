/**
 * The stroke of Mastodon's Phosphor icons, by design (designIcons in
 * themes/index.ts). Icons that set no weight of their own take it from here;
 * active ones keep Mastodon's filled weight.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { IconContext } from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';

import { createExternalState } from './external_state.ts';

const weight = createExternalState<IconWeight>(() => 'regular');

export const setIconWeight = weight.set;

export function IconWeightProvider({ children }: { children: ReactNode }) {
  const current = weight.use();
  const value = useMemo(() => ({ weight: current }), [current]);
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

/**
 * A component's view of one optional API: it re-renders when a probe answers
 * (api_capabilities.ts notifies subscribers). Kept out of api_capabilities.ts,
 * which the unit tests load without React.
 */
import { useSyncExternalStore } from 'react';

import { subscribeSupport, support } from './api_capabilities.ts';
import type { Capability, Support } from './api_capabilities.ts';

export function useSupport(capability: Capability): Support {
  return useSyncExternalStore(subscribeSupport, () => support(capability));
}

/** Collections (Mastodon 4.6) for the account menu, which may render before the probe answers. */
export const useCollectionsAvailable = () => useSupport('collections') !== 'unsupported';

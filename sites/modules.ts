import type { SiteModule } from '@core/site/types';
import {
  AURALIS_EVENT_ID,
  DEMO_EVENT_ID,
  DEMO_SUMMIT_EVENT_ID,
} from './registry';

// Event id → its custom-coded site (lazy, so one site's code never ships in
// another site's bundle; docs/system-design.md §10.2). Kept apart from
// registry.ts, which the proxy imports and must stay tiny.

export const siteModules: Record<
  string,
  () => Promise<{ default: SiteModule }>
> = {
  [DEMO_EVENT_ID]: () => import('./demo/launch-webinar/site'),
  [DEMO_SUMMIT_EVENT_ID]: () => import('./demo/orbit-summit/site'),
  [AURALIS_EVENT_ID]: () => import('./auralis/design-live/site'),
};

import { PlatformHomePage } from '@/components/platform-home';

// /platform — the same directory homepage, served on EVERY host (shared
// prefix in the proxy) so the platform is reachable from any event domain,
// including from a phone on an org host.
export default function PlatformPage() {
  return <PlatformHomePage />;
}

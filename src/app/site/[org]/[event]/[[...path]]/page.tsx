import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { orgs } from '@sites/registry';
import { siteModules } from '@sites/modules';
import { getPublicEventContent } from '@core/content/public';

// Public event pages (docs/system-design.md §4.2, §10.1). Reached only via the
// proxy rewrite <org host>/<event>/... → /site/<org>/<event>/...; direct
// requests to /site are 404 at the proxy. Pages are static with ISR; the
// cache entry is per internal path, i.e. per org + event.

export const revalidate = 3600;
export const dynamicParams = false;

type Params = { org: string; event: string; path?: string[] };

function resolve(params: Params) {
  const org = orgs.find((o) => o.slug === params.org);
  const event = org?.events.find((e) => e.slug === params.event);
  if (!org || !event) return null;
  return { org, event, pathKey: (params.path ?? []).join('/') };
}

export async function generateStaticParams(): Promise<Params[]> {
  const params: Params[] = [];
  for (const org of orgs) {
    for (const event of org.events) {
      const load = siteModules[event.id];
      if (!load) continue;
      const site = (await load()).default;
      for (const key of Object.keys(site.pages)) {
        params.push({
          org: org.slug,
          event: event.slug,
          path: key ? key.split('/') : [],
        });
      }
    }
  }
  return params;
}

async function load(params: Params) {
  const resolved = resolve(params);
  if (!resolved) return null;
  const loader = siteModules[resolved.event.id];
  if (!loader) return null;
  const site = (await loader()).default;
  const page = site.pages[resolved.pathKey];
  if (!page) return null;

  const content = await getPublicEventContent(resolved.event.id);
  if (!content) return null;
  // Registry typo guard: the row must be this org's event with this slug.
  if (
    content.event.id !== resolved.event.id ||
    content.event.slug !== resolved.event.slug ||
    content.event.org.slug !== resolved.org.slug
  ) {
    console.error('registry/event mismatch', {
      eventId: resolved.event.id,
      registrySlug: resolved.event.slug,
    });
    return null;
  }
  return { site, page, content, resolved };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const loaded = await load(await params);
  if (!loaded) return {};
  const base: Metadata = {
    title: loaded.content.event.name,
    robots: { index: true, follow: true },
  };
  return {
    ...base,
    ...loaded.site.metadata?.(loaded.content, loaded.resolved.pathKey),
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const loaded = await load(await params);
  if (!loaded) notFound();
  const Page = loaded.page;
  return (
    <Page
      content={loaded.content}
      basePath={`/${loaded.resolved.event.slug}`}
    />
  );
}

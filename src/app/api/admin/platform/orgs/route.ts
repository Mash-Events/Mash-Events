import { z } from 'zod';
import { platformRoute, platformRpcError } from '@core/http/platform-route';
import { RouteError } from '@core/http/event-route';

// GET/POST /api/admin/platform/orgs — organisations with their events.

export const dynamic = 'force-dynamic';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
    'Use lowercase letters, digits and hyphens.'
  );

export const GET = platformRoute({}, async ({ db }) => {
  const { data, error } = await db
    .from('organizations')
    .select(
      'id, slug, name, status, events(id, slug, name, kind, status, starts_at)'
    )
    .order('name');
  if (error) throw new RouteError(500, 'server_error');
  return { organizations: data ?? [] };
});

export const POST = platformRoute(
  {
    body: z.object({ slug, name: z.string().trim().min(1).max(200) }).strict(),
  },
  async ({ db, body }) => {
    const { data, error } = await db.rpc('create_organization', {
      p_slug: body.slug,
      p_name: body.name,
    });
    if (error) throw platformRpcError(error);
    return { id: data };
  }
);

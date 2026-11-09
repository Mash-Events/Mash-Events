import { z } from 'zod';
import { platformRoute, platformRpcError } from '@core/http/platform-route';

// POST /api/admin/platform/events — create an event under an organisation.
// After creating it, add sites/<org>/<event>/ and the registry entry (§14).

export const dynamic = 'force-dynamic';

export const POST = platformRoute(
  {
    body: z
      .object({
        org_id: z.string().uuid(),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(
            /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
            'Use lowercase letters, digits and hyphens.'
          ),
        name: z.string().trim().min(1).max(200),
        kind: z.enum(['webinar', 'in_person', 'hybrid']),
        timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
        starts_at: z.string().datetime({ offset: true }).nullable().optional(),
        ends_at: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .strict(),
  },
  async ({ db, body }) => {
    const { data, error } = await db.rpc('create_event', {
      p_org_id: body.org_id,
      p_slug: body.slug,
      p_name: body.name,
      p_kind: body.kind,
      p_timezone: body.timezone,
      p_starts_at: body.starts_at ?? null,
      p_ends_at: body.ends_at ?? null,
    });
    if (error) throw platformRpcError(error);
    return { id: data };
  }
);

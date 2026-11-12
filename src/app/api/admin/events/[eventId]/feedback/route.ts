import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';
import { checkEventPermission } from '@core/auth/server';
import { revalidateEventContent } from '@core/content/revalidate';

// GET/POST /api/admin/events/<eventId>/feedback (docs/system-design.md
// §16.4): the per-event feedback form editor (content.edit) and the
// response list (registrations.read). GET returns both; the tab only shows
// the editor parts it has permission for.

export const dynamic = 'force-dynamic';

const question = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{1,30}$/),
    label: z.string().trim().min(1).max(120),
    type: z.enum(['text', 'textarea', 'select']),
    options: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
    required: z.boolean().optional(),
  })
  .strict();

const saveBody = z
  .object({
    enabled: z.boolean(),
    headline: z.string().trim().min(1).max(120),
    thanks: z.string().trim().min(1).max(200),
    questions: z.array(question).max(8),
  })
  .strict();

export const GET = eventRoute(
  { permission: 'registrations.read', write: false },
  async ({ db, event }) => {
    // Reviewers see responses; only content.edit holders get the form.
    const canEdit = (
      await checkEventPermission(
        { id: event.id, orgId: event.orgId },
        'content.edit'
      )
    ).ok;
    const [form, responses] = await Promise.all([
      canEdit
        ? db
            .from('event_feedback_forms')
            .select('enabled, headline, thanks, questions')
            .eq('event_id', event.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db
        .from('event_feedback_responses')
        .select(
          'id, rating, answers, submitted_at, registrations(code, first_name, last_name)'
        )
        .eq('event_id', event.id)
        .order('submitted_at', { ascending: false })
        .limit(500),
    ]);
    if (responses.error) throw responses.error;
    return {
      form: form.data ?? {
        enabled: false,
        headline: 'How was the event?',
        thanks: 'Thank you for your feedback.',
        questions: [],
      },
      responses: responses.data ?? [],
    };
  }
);

export const POST = eventRoute(
  { permission: 'content.edit', body: saveBody },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('save_feedback_form', {
      p_event_id: event.id,
      p_enabled: body.enabled,
      p_headline: body.headline,
      p_thanks: body.thanks,
      p_questions: body.questions,
    });
    if (error) throw rpcError(error);
    revalidateEventContent(event.id);
    return data as { result: string };
  }
);

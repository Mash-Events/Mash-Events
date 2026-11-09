import { z } from 'zod';

// Base public registration form (docs/system-design.md §5.3, §7). Event sites
// extend `answers` with their own zod schema in sites/<org>/<event>/form.ts.

const trimmed = (max: number) => z.string().trim().max(max);

/** Normalises a phone number to E.164; defaults to India (+91). */
export function toE164(raw: string, defaultCountryCode = '91'): string | null {
  const cleaned = raw.replace(/[\s().-]/g, '');
  if (!cleaned) return null;
  let digits: string;
  if (cleaned.startsWith('+')) digits = cleaned.slice(1);
  else if (cleaned.startsWith('00')) digits = cleaned.slice(2);
  else if (/^0?[6-9]\d{9}$/.test(cleaned) && defaultCountryCode === '91') {
    digits = `91${cleaned.replace(/^0/, '')}`;
  } else digits = `${defaultCountryCode}${cleaned.replace(/^0/, '')}`;
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

export const answersSchema = z
  .record(
    z.string().max(64),
    z.union([
      z.string().max(2000),
      z.number(),
      z.boolean(),
      z.array(z.string().max(200)).max(20),
      z.null(),
    ])
  )
  .refine((value) => Object.keys(value).length <= 50, 'Too many answers.')
  .default({});

export const registrationSchema = z
  .object({
    first_name: trimmed(100).min(1, 'Enter your first name.'),
    last_name: trimmed(100).default(''),
    email: z
      .string()
      .trim()
      .max(320)
      .email('Enter a valid email address.')
      .transform((value) => value.toLowerCase()),
    organisation: trimmed(200).optional(),
    category: trimmed(100).optional(),
    phone: trimmed(32).optional(),
    whatsapp_opt_in: z.boolean().default(false),
    consent: z.literal(true, {
      error: 'Please accept the privacy notice to register.',
    }),
    answers: answersSchema,
    turnstile_token: z.string().max(4096).optional(),
  })
  .strict()
  .transform((value, ctx) => {
    const phone = value.phone ? toE164(value.phone) : null;
    if (value.phone && !phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Enter a valid phone number.',
      });
    }
    if (value.whatsapp_opt_in && !phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Add a phone number to get WhatsApp updates.',
      });
    }
    return { ...value, phone_e164: phone };
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Payload for the submit_registration RPC (no token, no raw phone). */
export function toSubmitPayload(input: RegistrationInput) {
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    organisation: input.organisation ?? null,
    category: input.category ?? null,
    phone_e164: input.phone_e164,
    whatsapp_opt_in: input.whatsapp_opt_in,
    answers: input.answers,
  };
}

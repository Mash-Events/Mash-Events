// Rewritten for Supabase Auth (docs/system-design.md §6).
// Reasons come from core/auth's permission checks.
const COPY = {
  unauthenticated: {
    title: 'Please sign in.',
    description: 'Sign in with Google or your email and password to continue.',
  },
  mfa_required: {
    title: 'Two-step verification is required.',
    description:
      'Enter the code from your authenticator app to open the admin console.',
  },
  no_membership: {
    title: 'You do not have access to this event.',
    description:
      'Ask a super admin to add you to this event or its organisation.',
  },
  auth_unavailable: {
    title: 'Admin sign-in is not configured for this deployment.',
    description:
      'Set the Supabase URL and publishable key for this environment, then redeploy.',
  },
};

const DEFAULT_COPY = {
  title: 'Admin access is temporarily unavailable.',
  description: 'The admin session could not be checked. Try again shortly.',
};

export default function AdminAccessFallback({
  operator,
  heading = 'Admin access is temporarily unavailable.',
}) {
  const reason = operator?.reason || 'unknown';
  const copy = COPY[reason] || DEFAULT_COPY;

  return (
    <main className="min-h-screen bg-[#f3f3f2] px-6 py-24 font-admin-sans text-[#141414]">
      <div className="mx-auto max-w-3xl rounded-[10px] border border-black/[0.07] bg-white p-8 shadow-[0_4px_20px_rgba(17,17,17,0.05)]">
        <p className="text-xs font-medium text-[#8c8c8c]">Access Required</p>
        <h1 className="mt-3 font-admin-display text-4xl font-semibold tracking-tight text-[#141414]">
          {heading}
        </h1>
        <p className="mt-4 text-sm font-semibold leading-relaxed text-[#3b3b3b]">
          {copy.title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#8c8c8c]">
          {copy.description}
        </p>
        <p className="mt-6 text-xs text-[#8c8c8c]">
          Reason: <span className="font-medium text-[#141414]">{reason}</span>
        </p>
      </div>
    </main>
  );
}

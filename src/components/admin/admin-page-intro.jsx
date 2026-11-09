'use client';

export default function AdminPageIntro({ description, actions = null }) {
  if (!description && !actions) return null;

  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}
    >
      {description && (
        <p
          style={{
            margin: 0,
            maxWidth: 740,
            fontSize: 13,
            color: 'var(--adm-ink-3)',
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      )}
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </section>
  );
}

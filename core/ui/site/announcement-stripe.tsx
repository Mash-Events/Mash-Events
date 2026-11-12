'use client';

import { useEffect, useState } from 'react';
import type { PublicAnnouncement } from '../../site/types';

// Announcement stripe (docs/system-design.md §10.1): the latest published
// announcements cycle in a slim bar under the hero. Server-rendered with
// the newest message visible; JS only adds the rotation.

export function AnnouncementStripe({
  announcements,
}: {
  announcements: PublicAnnouncement[];
}) {
  const [index, setIndex] = useState(0);
  const count = announcements.length;
  const hasMultiple = count > 1;

  useEffect(() => {
    if (!hasMultiple) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [hasMultiple, count]);

  if (count === 0) return null;
  const current = announcements[index] ?? announcements[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-y px-6 py-3 text-sm ${
        current.level === 'highlight'
          ? 'border-black/10 bg-[#cb1977] text-white'
          : 'border-black/10 bg-[#f5f5f4] text-black'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            current.level === 'highlight'
              ? 'animate-pulse bg-white'
              : 'bg-[#cb1977]'
          }`}
        />
        <p className="min-w-0 flex-1 truncate font-medium">{current.body}</p>
        {hasMultiple ? (
          <span className="hidden shrink-0 gap-1 sm:flex" aria-hidden>
            {announcements.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === index
                    ? current.level === 'highlight'
                      ? 'bg-white'
                      : 'bg-[#cb1977]'
                    : current.level === 'highlight'
                      ? 'bg-white/40'
                      : 'bg-black/20'
                }`}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

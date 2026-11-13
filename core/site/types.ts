import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Contract between the engine and a custom-coded event site
// (sites/<org>/<event>/site.tsx). Docs: docs/system-design.md §2.1, §10.

export type PublicEvent = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  kind: 'webinar' | 'in_person' | 'hybrid';
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  registration_open: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  /** Fail-open: absent key = form open (docs §10.1). */
  submissions_open: boolean;
  org: { slug: string; name: string };
};

export type PublicSpeaker = {
  id: string;
  name: string;
  title: string | null;
  affiliation: string | null;
  bio: string | null;
  photo_path: string | null;
};

export type PublicSession = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  track: string | null;
  room: string | null;
  speaker_ids: string[];
};

export type PublicSponsor = {
  id: string;
  name: string;
  tier: string | null;
  logo_path: string | null;
  url: string | null;
};

export type PublicAnnouncement = {
  id: string;
  body: string;
  level: 'info' | 'highlight';
  published_at: string;
};

export type FeedbackQuestion = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
  required?: boolean;
};

export type PublicFeedbackForm = {
  enabled: boolean;
  headline: string;
  thanks: string;
  questions: FeedbackQuestion[];
};

export type EventContent = {
  event: PublicEvent;
  speakers: PublicSpeaker[];
  sessions: PublicSession[];
  sponsors: PublicSponsor[];
  /** Latest published announcements, newest first (may be missing). */
  announcements?: PublicAnnouncement[];
  /** The event's feedback form, only when enabled (else absent). */
  feedback?: PublicFeedbackForm | null;
};

export type SitePageProps = {
  content: EventContent;
  /** Public base path of the event, e.g. "/webinar-2026". */
  basePath: string;
};

/** Extra registration questions a site adds to the base form. */
export type FormQuestion = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
  required?: boolean;
  maxLength?: number;
};

export type SiteModule = {
  /** Page components keyed by sub-path: '' is the home page, 'agenda', ... */
  pages: Record<
    string,
    (props: SitePageProps) => ReactNode | Promise<ReactNode>
  >;
  metadata?: (content: EventContent, path: string) => Metadata;
};

import 'server-only';
import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

// Agenda PDF (docs/system-design.md §8): the event's full schedule rendered
// as a clean multi-page handout, attached to reminder emails (and available
// for any future download button). Generated on the fly, never stored.

export type AgendaSession = {
  title: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  track: string | null;
  speakers: string[];
};

export type AgendaPdfInput = {
  orgName: string;
  eventName: string;
  when: string;
  sessions: AgendaSession[];
};

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10 },
  band: {
    backgroundColor: '#0c0a09',
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  org: { fontSize: 8, letterSpacing: 2, color: '#a8a29e' },
  title: { fontSize: 20, bold: true, color: '#ffffff', marginTop: 4 },
  when: { fontSize: 9, color: '#d6d3d1', marginTop: 4 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
    paddingVertical: 7,
  },
  time: { width: 92, color: '#78716c', fontSize: 9, paddingTop: 2 },
  main: { flex: 1 },
  sessionTitle: { fontSize: 11, bold: true, color: '#1c1917' },
  meta: { fontSize: 8.5, color: '#78716c', marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: '#a8a29e',
  },
});

export async function renderAgendaPdf(input: AgendaPdfInput): Promise<Buffer> {
  const rows = input.sessions
    .filter((session) => session.startsAt && session.endsAt)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((session) => (
      <View
        key={session.title + session.startsAt}
        style={styles.row}
        wrap={false}
      >
        <Text style={styles.time}>
          {timeLabel(session.startsAt)}–{timeLabel(session.endsAt)}
        </Text>
        <View style={styles.main}>
          <Text style={styles.sessionTitle}>{session.title}</Text>
          {session.speakers.length ? (
            <Text style={styles.meta}>{session.speakers.join(', ')}</Text>
          ) : null}
          {session.room || session.track ? (
            <Text style={styles.meta}>
              {[session.room, session.track].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
    ));

  const doc = (
    <Document
      title={`Agenda — ${input.eventName}`}
      author={input.orgName}
      subject={input.eventName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.band} fixed>
          <Text style={styles.org}>{input.orgName.toUpperCase()}</Text>
          <Text style={styles.title}>{input.eventName}</Text>
          <Text style={styles.when}>{input.when}</Text>
        </View>
        {rows}
        <Text style={styles.footer} fixed>
          {input.eventName} · organised by {input.orgName}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc) as unknown as Promise<Buffer>;
}

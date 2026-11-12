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

// Certificate PDF (docs/system-design.md §9.1 phase 3): a landscape A4
// certificate of participation with the event facts, the attendee name and
// the verification code. Generated on the fly, never stored.

export type CertificatePdfInput = {
  orgName: string;
  eventName: string;
  when: string;
  attendeeName: string;
  code: string;
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    padding: 0,
  },
  frame: {
    margin: 36,
    borderWidth: 2,
    borderColor: '#0c0a09',
    height: '92%',
    paddingVertical: 40,
    paddingHorizontal: 56,
    alignItems: 'center',
  },
  org: { fontSize: 10, letterSpacing: 2, color: '#78716c' },
  title: { fontSize: 30, bold: true, color: '#0c0a09', marginTop: 24 },
  subtitle: { fontSize: 12, color: '#78716c', marginTop: 8 },
  name: {
    fontSize: 34,
    bold: true,
    color: '#1c1917',
    marginTop: 40,
    marginBottom: 40,
    textAlign: 'center',
  },
  when: { fontSize: 11, color: '#44403c' },
  codeRow: {
    flexDirection: 'row',
    marginTop: 32,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 10, color: '#78716c', marginRight: 8 },
  code: { fontSize: 13, letterSpacing: 3, bold: true, color: '#1c1917' },
  footer: { fontSize: 9, color: '#a8a29e', marginTop: 36 },
});

export async function renderCertificatePdf(
  input: CertificatePdfInput
): Promise<Buffer> {
  const doc = (
    <Document
      title={`Certificate ${input.code}`}
      author={input.orgName}
      subject={input.eventName}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.frame}>
          <Text style={styles.org}>{input.orgName.toUpperCase()}</Text>
          <Text style={styles.title}>Certificate of Participation</Text>
          <Text style={styles.subtitle}>{input.eventName}</Text>
          <Text style={styles.name}>{input.attendeeName}</Text>
          {input.when ? <Text style={styles.when}>{input.when}</Text> : null}
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>CERTIFICATE CODE</Text>
            <Text style={styles.code}>{input.code}</Text>
          </View>
          <Text style={styles.footer}>
            Verify this certificate on the event website with the code above.
          </Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc) as unknown as Promise<Buffer>;
}

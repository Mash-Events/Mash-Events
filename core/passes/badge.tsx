import 'server-only';
import React from 'react';
import {
  Document,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';

// Core default badge layout (docs/system-design.md §9.1, §16.2: sites can
// override per event later). Landscape badge with the event band, the
// attendee, the badge code and the QR pass token.

export type BadgeInput = {
  orgName: string;
  eventName: string;
  when: string;
  attendeeName: string;
  code: string;
  passToken: string;
};

const styles = StyleSheet.create({
  page: {
    width: 282, // 99mm
    height: 178, // 63mm
    backgroundColor: '#ffffff',
    padding: 0,
  },
  band: {
    backgroundColor: '#0c0a09',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
  },
  org: { fontSize: 8, letterSpacing: 1, color: '#a8a29e' },
  event: { fontSize: 15, bold: true, color: '#ffffff', marginTop: 2 },
  when: { fontSize: 8, color: '#d6d3d1', marginTop: 3 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingTop: 8,
    paddingBottom: 8,
    paddingRight: 14,
  },
  who: { flex: 1, paddingRight: 6 },
  name: { fontSize: 17, bold: true, color: '#1c1917' },
  code: { fontSize: 11, color: '#78716c', marginTop: 5, letterSpacing: 2 },
  qrBox: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e7e5e4',
    borderRadius: 4,
    padding: 4,
  },
  qr: { width: 74, height: 74 },
});

export async function renderBadgePdf(input: BadgeInput): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(input.passToken, {
    margin: 0,
    width: 480,
    errorCorrectionLevel: 'M',
  });
  const doc = (
    <Document
      title={`Badge ${input.code}`}
      author={input.orgName}
      subject={input.eventName}
    >
      <Page size={[282, 178]} style={styles.page}>
        <View style={styles.band} fixed>
          <Text style={styles.org}>{input.orgName.toUpperCase()}</Text>
          <Text style={styles.event}>{input.eventName}</Text>
          <Text style={styles.when}>{input.when}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.who}>
            <Text style={styles.name}>{input.attendeeName}</Text>
            <Text style={styles.code}>{input.code}</Text>
          </View>
          <View style={styles.qrBox}>
            <Image style={styles.qr} src={qrDataUrl} />
          </View>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc) as unknown as Promise<Buffer>;
}

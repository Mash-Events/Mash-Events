import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { EVENT_CONFIG } from '@/lib/registration-constants';
import badgeLayoutUtils from '@/lib/registration-badge-layout.cjs';
import badgeExportUtils from '@/lib/badge-export-utils.cjs';
import qrPassTemplateUtils from '@/lib/qr-pass-template.cjs';
import {
  buildBadgeDisplayName,
  PROFILE_BUCKET,
} from '@/lib/registration-utils';

const {
  getBadgeLowerSectionLayout,
  getBadgeTierTheme,
  normalizeBadgeSingleLine,
} = badgeLayoutUtils;
const { buildCsvExport, buildExcelExport } = badgeExportUtils;
const { isInvitationQrPassTemplateEnabled } = qrPassTemplateUtils;

export { buildCsvExport, buildExcelExport };

let cachedLogoDataUrl = null;
let cachedHeaderBackgroundDataUrl = null;
let cachedInvitationBackgroundDataUrl = null;

Font.register({
  family: 'Inter',
  src: path.join(
    process.cwd(),
    'public',
    'fonts',
    'inter',
    'Inter-Regular.ttf'
  ),
});

async function fileToDataUrl(filePath, mimeType) {
  const buffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function getMimeTypeFromFilePath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.jpg' || extension === '.jpeg'
    ? 'image/jpeg'
    : 'image/png';
}

export async function getBadgeLogoDataUrl() {
  if (cachedLogoDataUrl) {
    return cachedLogoDataUrl;
  }

  const customLogoPath = process.env.BADGE_LOGO_FILE_PATH?.trim();
  const fallbackPath = path.join(
    process.cwd(),
    'public',
    'img',
    'mash-logo.png'
  );

  if (customLogoPath) {
    try {
      cachedLogoDataUrl = await fileToDataUrl(
        customLogoPath,
        getMimeTypeFromFilePath(customLogoPath)
      );
      return cachedLogoDataUrl;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  cachedLogoDataUrl = await fileToDataUrl(
    fallbackPath,
    getMimeTypeFromFilePath(fallbackPath)
  );
  return cachedLogoDataUrl;
}

async function getBadgeHeaderBackgroundDataUrl() {
  if (cachedHeaderBackgroundDataUrl) {
    return cachedHeaderBackgroundDataUrl;
  }

  const headerBackgroundPath = path.join(
    process.cwd(),
    'public',
    'img',
    'gradient-header.png'
  );

  try {
    cachedHeaderBackgroundDataUrl = await fileToDataUrl(
      headerBackgroundPath,
      'image/png'
    );
  } catch {
    cachedHeaderBackgroundDataUrl = null;
  }

  return cachedHeaderBackgroundDataUrl;
}

export async function buildQrDataUrl(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280,
    color: {
      dark: '#111827',
      light: '#FFFFFF',
    },
  });
}

async function buildInvitationQrDataUrl(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 420,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}

async function getInvitationBackgroundDataUrl() {
  if (cachedInvitationBackgroundDataUrl) {
    return cachedInvitationBackgroundDataUrl;
  }

  cachedInvitationBackgroundDataUrl = await fileToDataUrl(
    path.join(
      process.cwd(),
      'public',
      'img',
      'mash-pass-invitation-background.jpg'
    ),
    'image/jpeg'
  );
  return cachedInvitationBackgroundDataUrl;
}

export async function buildQrPngBuffer(token) {
  return QRCode.toBuffer(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 720,
    color: {
      dark: '#111827',
      light: '#FFFFFF',
    },
  });
}

async function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function getMimeTypeFromPhotoPath(photoPath) {
  const extension = path.extname(String(photoPath || '')).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  return 'image/png';
}

async function getBadgePhotoDataUrl(registration) {
  const photoPath = String(registration?.profile_photo_path || '').trim();

  if (!photoPath) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const downloadResult = await supabase.storage
      .from(PROFILE_BUCKET)
      .download(photoPath);

    if (downloadResult.error || !downloadResult.data) {
      return null;
    }

    const arrayBuffer = await downloadResult.data.arrayBuffer();
    return bufferToDataUrl(
      Buffer.from(arrayBuffer),
      getMimeTypeFromPhotoPath(photoPath)
    );
  } catch {
    return null;
  }
}

function getImageFormatFromDataUrl(dataUrl, fallback = 'PNG') {
  if (typeof dataUrl !== 'string') {
    return fallback;
  }

  if (
    dataUrl.startsWith('data:image/jpeg') ||
    dataUrl.startsWith('data:image/jpg')
  ) {
    return 'JPEG';
  }

  if (dataUrl.startsWith('data:image/png')) {
    return 'PNG';
  }

  return fallback;
}

function formatEventDateRange() {
  const start = new Date(`${EVENT_CONFIG.startDate}T00:00:00+05:30`);
  const end = new Date(`${EVENT_CONFIG.endDate}T00:00:00+05:30`);
  const formatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const startLabel = formatter.format(start);
  const endLabel = formatter.format(end);

  if (startLabel === endLabel) {
    return startLabel;
  }

  return `${startLabel} - ${endLabel}`;
}

// mm → pt conversion helper
const MM = (v) => v * 2.835;

const toHexReg = (r, g, b) =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

// Page size: 101.6mm × 152.4mm → 287.9pt × 432.0pt
const BADGE_PAGE_W = MM(101.6);
const BADGE_PAGE_H = MM(152.4);

function InvitationPassPage({ registration, qrDataUrl, backgroundDataUrl }) {
  const firstName = String(registration?.first_name || 'Participant').trim();
  const greetingFontSize = firstName.length > 24 ? 7.6 : 9.1;

  return (
    <Page
      size={[BADGE_PAGE_W, BADGE_PAGE_H]}
      style={{ backgroundColor: '#49112f' }}
    >
      <Image
        alt=""
        src={backgroundDataUrl}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: BADGE_PAGE_W,
          height: BADGE_PAGE_H,
        }}
      />
      <Text
        style={{
          position: 'absolute',
          top: 99.5,
          left: 20,
          width: BADGE_PAGE_W - 40,
          fontFamily: 'Inter',
          fontSize: greetingFontSize,
          lineHeight: 1.4,
          color: '#ffffff',
          textAlign: 'center',
        }}
      >
        {`Dear ${firstName},`}
      </Text>
      <Image
        alt="Mash Event 2026 QR entry pass"
        src={qrDataUrl}
        style={{
          position: 'absolute',
          top: 247.5,
          left: (BADGE_PAGE_W - 42) / 2,
          width: 42,
          height: 42,
        }}
      />
    </Page>
  );
}

function InstitutionalBadgePage({
  registration,
  qrDataUrl,
  logoDataUrl,
  photoDataUrl,
  headerLabel,
  headerBackgroundDataUrl,
}) {
  const displayName = buildBadgeDisplayName(registration);
  const badgeLabel = registration.badge_color_label || 'Delegate';
  const tierTheme = getBadgeTierTheme({
    badgeColorHex: registration.badge_color_hex,
    badgeColorLabel: badgeLabel,
  });
  const organizationLine = normalizeBadgeSingleLine(
    registration.organization || '',
    30
  );
  const categoryLabel = registration.attendee_category || 'Delegate';
  const eventDatesLabel = '14-15 Oct 2026';
  const compactHeaderLabel = normalizeBadgeSingleLine(headerLabel, 24);
  const lowerSectionLayout = getBadgeLowerSectionLayout();
  const policyRules = [
    'Carry a valid government-issued photo ID.',
    'Badge is valid only for the registered attendee.',
    'Security and venue instructions must be followed at all times.',
  ];

  const tierBgColor = toHexReg(...tierTheme.fillColor);
  const tierDotColor = toHexReg(...tierTheme.dotColor);
  const tierTextColor = toHexReg(...tierTheme.textColor);
  const headerBackgroundColor = '#181e3a';

  return (
    <Page
      size={[BADGE_PAGE_W, BADGE_PAGE_H]}
      style={{ backgroundColor: '#faf8f2', fontFamily: 'Helvetica' }}
    >
      {/* Header background */}
      {headerBackgroundDataUrl ? (
        <Image
          alt=""
          src={headerBackgroundDataUrl}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: BADGE_PAGE_W,
            height: MM(29.5),
          }}
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: MM(29.5),
            backgroundColor: headerBackgroundColor,
          }}
        />
      )}
      {/* Gold rule */}
      <View
        style={{
          position: 'absolute',
          top: MM(29.5),
          left: 0,
          right: 0,
          height: MM(1.8),
          backgroundColor: '#c9902c',
        }}
      />

      {/* Logo */}
      {logoDataUrl && (
        <Image
          alt=""
          src={logoDataUrl}
          style={{
            position: 'absolute',
            top: MM(7),
            left: MM(7),
            width: MM(25),
            height: MM(10.6),
          }}
        />
      )}

      {/* Vertical separator */}
      <View
        style={{
          position: 'absolute',
          top: MM(4),
          left: MM(34.7),
          width: 0.5,
          height: MM(20.5),
          backgroundColor: '#4e5982',
        }}
      />

      {/* "Trust & Safety India Festival" */}
      <Text
        style={{
          position: 'absolute',
          top: MM(8.5),
          left: MM(39),
          fontSize: 10.8,
          fontFamily: 'Helvetica-Bold',
          color: '#ffffff',
        }}
      >
        Trust &amp; Safety India Festival
      </Text>

      {/* Mash Event 2026 */}
      <Text
        style={{
          position: 'absolute',
          top: MM(15),
          left: MM(39),
          fontSize: 7.6,
          fontFamily: 'Helvetica-Bold',
          color: '#d6ab41',
        }}
      >
        Mash Event 2026
      </Text>

      {/* 14-15 October 2026 */}
      <Text
        style={{
          position: 'absolute',
          top: MM(15),
          left: MM(58.3),
          fontSize: 7.6,
          fontFamily: 'Helvetica-Bold',
          color: '#d6ab41',
        }}
      >
        14-15 October 2026
      </Text>

      {/* New Delhi, India */}
      <Text
        style={{
          position: 'absolute',
          top: MM(20.8),
          left: MM(39),
          fontSize: 7.8,
          color: '#ebeff7',
        }}
      >
        New Delhi, India
      </Text>

      {/* Badge pill (top-right of header) */}
      <View
        style={{
          position: 'absolute',
          top: MM(18.4),
          left: MM(71.5),
          width: MM(25.4),
          height: MM(7.6),
          backgroundColor: '#ffffff',
          borderRadius: 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 4.95,
            fontFamily: 'Helvetica-Bold',
            color: tierBgColor,
            textAlign: 'center',
          }}
        >
          {compactHeaderLabel}
        </Text>
      </View>

      {/* "ATTENDEE" label */}
      <Text
        style={{
          position: 'absolute',
          top: MM(37.7),
          left: MM(8),
          fontSize: 7.2,
          fontFamily: 'Helvetica-Bold',
          color: '#65738a',
        }}
      >
        ATTENDEE
      </Text>

      {/* Attendee name */}
      <Text
        style={{
          position: 'absolute',
          top: MM(44.3),
          left: MM(8),
          width: MM(62),
          fontSize: 17.8,
          fontFamily: 'Helvetica-Bold',
          color: '#0f172a',
        }}
      >
        {displayName || ''}
      </Text>

      {/* Organization */}
      <Text
        style={{
          position: 'absolute',
          top: MM(54.9),
          left: MM(8),
          width: MM(60),
          fontSize: 10.5,
          color: '#334155',
        }}
      >
        {organizationLine || '-'}
      </Text>

      {/* Photo box */}
      <View
        style={{
          position: 'absolute',
          top: MM(36.3),
          left: MM(73.2),
          width: MM(20.8),
          height: MM(20.8),
          backgroundColor: '#ffffff',
          borderWidth: 0.5,
          borderColor: '#0f172a',
          overflow: 'hidden',
        }}
      >
        {photoDataUrl ? (
          <Image
            alt=""
            src={photoDataUrl}
            style={{ width: MM(19.4), height: MM(19.4), margin: MM(0.7) }}
          />
        ) : (
          <>
            <View
              style={{
                position: 'absolute',
                top: MM(3.4),
                left: MM(7.2),
                width: MM(6.8),
                height: MM(6.8),
                borderRadius: MM(3.4),
                backgroundColor: '#c9902c',
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: MM(10),
                left: MM(4.4),
                width: MM(11.6),
                height: MM(11.6),
                borderRadius: MM(5.8),
                backgroundColor: '#264782',
              }}
            />
          </>
        )}
      </View>

      {/* Tier pill */}
      <View
        style={{
          position: 'absolute',
          top: MM(64.2),
          left: MM(8),
          width: MM(84.2),
          height: MM(7.5),
          backgroundColor: tierBgColor,
          borderRadius: 2,
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: MM(7.5) / 2 - MM(1.35),
            left: MM(2.7),
            width: MM(2.7),
            height: MM(2.7),
            borderRadius: MM(1.35),
            backgroundColor: tierDotColor,
          }}
        />
        <Text
          style={{
            position: 'absolute',
            top: MM(2.1),
            left: MM(8),
            fontSize: 7.1,
            fontFamily: 'Helvetica-Bold',
            color: tierTextColor,
          }}
        >
          {tierTheme.label}
        </Text>
        <Text
          style={{
            position: 'absolute',
            top: MM(2.1),
            right: MM(1.5),
            fontSize: 6.8,
            color: tierTextColor,
            textAlign: 'right',
          }}
        >
          {categoryLabel}
        </Text>
      </View>

      {/* Divider 1 */}
      <View
        style={{
          position: 'absolute',
          top: MM(76.8),
          left: MM(8),
          width: MM(85.6),
          height: 0.35,
          backgroundColor: '#e0e4eb',
        }}
      />

      {/* Column headers: REG. ID / CATEGORY / DATES */}
      <Text
        style={{
          position: 'absolute',
          top: MM(81),
          left: MM(8),
          fontSize: 7.2,
          fontFamily: 'Helvetica-Bold',
          color: '#64748b',
        }}
      >
        REG. ID
      </Text>
      <Text
        style={{
          position: 'absolute',
          top: MM(81),
          left: MM(41.5),
          fontSize: 7.2,
          fontFamily: 'Helvetica-Bold',
          color: '#64748b',
        }}
      >
        CATEGORY
      </Text>
      <Text
        style={{
          position: 'absolute',
          top: MM(81),
          left: MM(71),
          width: MM(15),
          fontSize: 7.2,
          fontFamily: 'Helvetica-Bold',
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        DATES
      </Text>

      {/* Values row */}
      <Text
        style={{
          position: 'absolute',
          top: MM(85.5),
          left: MM(8),
          width: MM(33),
          fontSize: 9.2,
          fontFamily: 'Helvetica-Bold',
          color: '#0f172a',
        }}
      >
        {registration.registration_code || '-'}
      </Text>
      <Text
        style={{
          position: 'absolute',
          top: MM(85.5),
          left: MM(41.5),
          width: MM(18),
          fontSize: 9.2,
          fontFamily: 'Helvetica-Bold',
          color: '#0f172a',
        }}
      >
        {categoryLabel}
      </Text>
      <Text
        style={{
          position: 'absolute',
          top: MM(85.5),
          left: MM(71),
          width: MM(15),
          fontSize: 9.2,
          fontFamily: 'Helvetica-Bold',
          color: '#0f172a',
          textAlign: 'center',
        }}
      >
        {eventDatesLabel}
      </Text>

      {/* Divider 2 */}
      <View
        style={{
          position: 'absolute',
          top: MM(91.3),
          left: MM(8),
          width: MM(85.6),
          height: 0.35,
          backgroundColor: '#e0e4eb',
        }}
      />

      {/* Entry Pass label */}
      <Text
        style={{
          position: 'absolute',
          top: MM(lowerSectionLayout.entryPassLabelY - 1.8),
          left: MM(8),
          fontSize: 7.2,
          fontFamily: 'Helvetica-Bold',
          color: '#64748b',
        }}
      >
        ENTRY PASS
      </Text>

      {/* Policy title */}
      <Text
        style={{
          position: 'absolute',
          top: MM(lowerSectionLayout.policyTitleY - 1.8),
          left: MM(8),
          fontSize: 7.1,
          fontFamily: 'Helvetica-Bold',
          color: '#c9902c',
        }}
      >
        Policy rules
      </Text>

      {/* Policy rules */}
      {policyRules.map((rule, i) => (
        <Text
          key={i}
          style={{
            position: 'absolute',
            top: MM(lowerSectionLayout.policyRuleYs[i] - 1.2),
            left: MM(8),
            width: MM(42),
            fontSize: 4.7,
            color: '#58667a',
          }}
        >
          {`- ${rule}`}
        </Text>
      ))}

      {/* QR box */}
      <View
        style={{
          position: 'absolute',
          top: MM(lowerSectionLayout.qrBox.y),
          left: MM(lowerSectionLayout.qrBox.x),
          width: MM(lowerSectionLayout.qrBox.width),
          height: MM(lowerSectionLayout.qrBox.height),
          backgroundColor: '#ffffff',
          borderWidth: 0.7,
          borderColor: '#dce0e8',
          borderRadius: MM(2.8),
        }}
      >
        {qrDataUrl ? (
          <Image
            alt=""
            src={qrDataUrl}
            style={{
              position: 'absolute',
              top: MM(2),
              left: MM(2),
              width: MM(lowerSectionLayout.qrCode.width),
              height: MM(lowerSectionLayout.qrCode.height),
            }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              style={{ fontSize: 6, color: '#64748b', textAlign: 'center' }}
            >
              {'QR pass not\nissued yet'}
            </Text>
          </View>
        )}
      </View>

      {/* Reg code below QR */}
      <Text
        style={{
          position: 'absolute',
          top: MM(lowerSectionLayout.qrRegistrationCodeY - 1.7),
          left: MM(60),
          width: MM(32.5),
          fontSize: 6.6,
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        {registration.registration_code || '-'}
      </Text>

      {/* "Scan to verify" */}
      <Text
        style={{
          position: 'absolute',
          top: MM(lowerSectionLayout.scanLabelY - 1.9),
          left: MM(60),
          width: MM(32.5),
          fontSize: 7.5,
          fontFamily: 'Helvetica-Bold',
          color: '#0f172a',
          textAlign: 'center',
        }}
      >
        Scan to verify
      </Text>

      {/* Footer strip (tier color) */}
      <View
        style={{
          position: 'absolute',
          top: MM(147.6),
          left: 0,
          right: 0,
          height: MM(4.8),
          backgroundColor: tierBgColor,
        }}
      />
      {/* Gold accent left */}
      <View
        style={{
          position: 'absolute',
          top: MM(147.6),
          left: 0,
          width: MM(2.6),
          height: MM(4.8),
          backgroundColor: '#c9902c',
        }}
      />
      {/* Footer text */}
      <Text
        style={{
          position: 'absolute',
          top: MM(149.2),
          left: 0,
          right: 0,
          fontSize: 5.6,
          fontFamily: 'Helvetica-Bold',
          color: '#ffffff',
          textAlign: 'center',
        }}
      >
        Organised with Mash Events
      </Text>
    </Page>
  );
}

export async function buildPassAttachment({ token, registration }) {
  const usesInvitationTemplate = isInvitationQrPassTemplateEnabled();

  if (usesInvitationTemplate) {
    const [qrDataUrl, backgroundDataUrl] = await Promise.all([
      buildInvitationQrDataUrl(token),
      getInvitationBackgroundDataUrl(),
    ]);
    const pdfBuffer = await renderToBuffer(
      <Document>
        <InvitationPassPage
          registration={registration}
          qrDataUrl={qrDataUrl}
          backgroundDataUrl={backgroundDataUrl}
        />
      </Document>
    );

    return {
      qrDataUrl,
      pdfBuffer,
      filename: `${registration.registration_code}-entry-pass.pdf`,
    };
  }

  const qrDataUrl = await buildQrDataUrl(token);
  const logoDataUrl = await getBadgeLogoDataUrl();
  const headerBackgroundDataUrl = await getBadgeHeaderBackgroundDataUrl();
  const photoDataUrl = await getBadgePhotoDataUrl(registration);

  const pdfBuffer = await renderToBuffer(
    <Document>
      <InstitutionalBadgePage
        registration={registration}
        qrDataUrl={qrDataUrl}
        logoDataUrl={logoDataUrl}
        photoDataUrl={photoDataUrl}
        headerLabel="OFFICIAL CREDENTIAL"
        headerBackgroundDataUrl={headerBackgroundDataUrl}
      />
    </Document>
  );

  return {
    qrDataUrl,
    pdfBuffer,
    filename: `${registration.registration_code}-badge.pdf`,
  };
}

export function buildBadgeExportRows(registrations) {
  return registrations.map((registration) => ({
    registration_id: registration.id,
    registration_code: registration.registration_code,
    first_name: registration.first_name,
    last_name: registration.last_name,
    email: registration.email,
    phone: registration.phone || '',
    organization: registration.organization,
    designation: registration.designation || '',
    category: registration.attendee_category,
    city: registration.city || '',
    country: registration.country || '',
    linkedin_url: registration.linkedin_url || '',
    attendance_reason: registration.attendance_reason || '',
    badge_display_name: buildBadgeDisplayName(registration),
    badge_color: registration.badge_color_label,
    badge_color_hex: registration.badge_color_hex,
    status: registration.status,
    qr_pass_issued: registration.qr_token ? 'Yes' : 'No',
    issue_date: registration.qr_pass_issued_at || '',
    registered_at: registration.created_at || '',
    print_batch_id: registration.last_badge_export_batch_id || '',
    exception_badge_required: registration.exception_badge_required
      ? 'Yes'
      : 'No',
  }));
}

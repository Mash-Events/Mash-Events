const LONG_TEXT_HEADINGS = new Set([
  'Pitch',
  'Motivation',
  'Message',
  'Enquiry details',
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function splitField(line) {
  const separator = line.indexOf(':');
  if (separator < 1 || separator > 40) return null;
  const label = line.slice(0, separator).trim();
  if (!label) return null;
  return { label, value: line.slice(separator + 1).trim() };
}

function renderParagraphs(lines) {
  return lines
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 14px;color:#3c4043;font-size:15px;line-height:25px;text-align:left;overflow-wrap:break-word;word-break:break-word">${escapeHtml(line)}</p>`
    )
    .join('');
}

function renderInternalNotificationHtml({ subject, text }) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim());
  const longTextStart = lines.findIndex(
    (line) => line.endsWith(':') && LONG_TEXT_HEADINGS.has(line.slice(0, -1))
  );
  const summaryLines =
    longTextStart < 0 ? lines : lines.slice(0, longTextStart);
  const longTextLines = longTextStart < 0 ? [] : lines.slice(longTextStart + 1);
  const longTextHeading =
    longTextStart < 0 ? '' : lines[longTextStart].slice(0, -1);
  const intro = [];
  const fields = [];
  const notes = [];

  for (const line of summaryLines) {
    if (!line) continue;
    const field = splitField(line);
    if (field?.value) {
      fields.push(field);
    } else if (fields.length) {
      notes.push(line);
    } else {
      intro.push(line);
    }
  }

  const fieldRows = fields
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:0 0 14px;text-align:left;vertical-align:top"><div style="margin:0 0 4px;color:#5f6368;font-size:11px;line-height:17px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(label)}</div><div style="color:#202124;font-size:15px;line-height:23px;overflow-wrap:break-word;word-break:break-word">${escapeHtml(value)}</div></td></tr>`
    )
    .join('');
  const detailBody = longTextLines
    .map((line) => {
      if (!line)
        return '<div style="height:10px;line-height:10px">&nbsp;</div>';
      if (line.endsWith(':') && LONG_TEXT_HEADINGS.has(line.slice(0, -1))) {
        return `<h3 style="margin:8px 0 10px;color:#202124;font-size:14px;line-height:21px;font-weight:600;text-align:left">${escapeHtml(line.slice(0, -1))}</h3>`;
      }
      return `<p style="margin:0 0 14px;color:#3c4043;font-size:15px;line-height:25px;text-align:left;overflow-wrap:break-word;word-break:break-word">${escapeHtml(line)}</p>`;
    })
    .join('');
  const introBlock = intro.length
    ? `<tr><td align="left" style="padding:18px 40px 0;text-align:left">${renderParagraphs(intro)}</td></tr>`
    : '';
  const fieldsBlock = fields.length
    ? `<tr><td align="left" style="padding:8px 40px 12px;text-align:left"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f8fa;border:1px solid #e8eaed;border-radius:10px"><tr><td style="padding:20px 22px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${fieldRows}</table></td></tr></table></td></tr>`
    : '';
  const notesBlock = notes.length
    ? `<tr><td align="left" style="padding:4px 40px 0;text-align:left">${renderParagraphs(notes)}</td></tr>`
    : '';
  const longTextBlock = longTextHeading
    ? `<tr><td align="left" style="padding:14px 40px 12px;text-align:left"><h2 style="margin:0 0 12px;color:#202124;font-size:17px;line-height:24px;font-weight:600;text-align:left">${escapeHtml(longTextHeading)}</h2>${detailBody}</td></tr>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#022d5d;font-family:Inter,Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#022d5d" style="background:#022d5d;background:linear-gradient(135deg,#022d5d 0%,#43358a 52%,#b34b5c 100%)"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="610" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:610px;background-color:#ffffff;border:1px solid #e8eaed"><tr><td align="center" bgcolor="#ffffff" style="padding:31px 40px 24px;background:#ffffff"><img src="cid:event-logo" width="194" height="54" alt="Mash Events" style="display:block;width:194px;height:54px;border:0;outline:none;text-decoration:none" /></td></tr><tr><td align="left" style="padding:20px 40px 8px;text-align:left"><p style="margin:0 0 8px;color:#5f6368;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:0.08em">Team notification</p><h1 style="margin:0;color:#202124;font-size:22px;line-height:29px;font-weight:600;text-align:left">${escapeHtml(subject)}</h1></td></tr>${introBlock}${fieldsBlock}${notesBlock}${longTextBlock}<tr><td style="padding:8px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="left" style="padding:18px 40px;color:#5f6368;font-size:12px;line-height:18px;text-align:left">Trust &amp; Safety India Festival 2026</td></tr><tr><td><img src="cid:event-footer" width="610" alt="Mash Event" style="display:block;width:100%;height:auto;border:0" /></td></tr></table></td></tr></table></body></html>`;
}

module.exports = { renderInternalNotificationHtml };

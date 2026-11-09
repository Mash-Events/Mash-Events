const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const spotUtils = require('../src/lib/spot-registration-utils.cjs');
const emails = require('../src/lib/application-acknowledgement-email.cjs');
const rosterExport = require('../src/lib/admin-roster-export.cjs');

test('spot registration opens only on the two event dates in India time', () => {
  assert.equal(spotUtils.eventDayNow(new Date('2026-10-13T18:29:59Z')), null);
  assert.equal(
    spotUtils.eventDayNow(new Date('2026-10-13T18:30:00Z')).eventDay,
    1
  );
  assert.equal(
    spotUtils.eventDayNow(new Date('2026-10-14T18:30:00Z')).eventDay,
    2
  );
  assert.equal(spotUtils.eventDayNow(new Date('2026-10-15T18:30:00Z')), null);
});

test('spot registration normalizes attendee details and rejects invalid email', () => {
  assert.deepEqual(
    spotUtils.normalizeSpotInput({
      name: '  Asha   Rao ',
      email: ' Operator@Example.org ',
      deskLabel: 'Main Desk',
    }),
    {
      fullName: 'Asha Rao',
      email: 'operator@example.org',
      designation: null,
      organization: null,
      deskLabel: 'Main Desk',
    }
  );
  assert.throws(
    () => spotUtils.normalizeSpotInput({ name: 'Guest', email: 'bad' }),
    /valid email/
  );
});

test('returning attendee does not receive a second confirmation email', () => {
  assert.equal(
    spotUtils.returningSpotEmailStatus({ email_status: 'sent' }),
    'not_required'
  );
  assert.equal(
    spotUtils.returningSpotEmailStatus({ email_status: 'needs_review' }),
    'needs_review'
  );
});

test('spot confirmation reflects the event day and creates no pass', () => {
  const email = emails.buildSpotRegistrationEmail({
    firstName: 'Asha',
    eventDay: 1,
  });
  assert.match(email.subject, /on-site registration is confirmed/);
  assert.match(email.text, /14 October 2026/);
  assert.match(email.text, /checked?[- ]in|check-in/i);
  assert.match(email.text, /all set to join the festival today/i);
  assert.doesNotMatch(email.text, /preview|sample/i);
});

test('roster CSV and Excel exports neutralize spreadsheet formulas', async () => {
  const columns = [{ key: 'name', label: 'Name' }];
  const rows = [{ name: '=HYPERLINK("bad")' }];
  assert.match(rosterExport.buildRosterCsv(columns, rows), /'=HYPERLINK/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    await rosterExport.buildRosterExcel(columns, rows, 'Test')
  );
  assert.equal(workbook.getWorksheet('Test').getCell('A2').value[0], "'");
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let badgeExportUtils;

test('badge export utils module loads', async () => {
  badgeExportUtils = require('../src/lib/badge-export-utils.cjs');
  assert.ok(badgeExportUtils);
});

test('buildCsvExport serializes rows with a header row', async () => {
  if (!badgeExportUtils) {
    badgeExportUtils = require('../src/lib/badge-export-utils.cjs');
  }

  const csv = badgeExportUtils.buildCsvExport([
    {
      registration_code: 'EVT-001',
      first_name: 'Ada',
      organization: 'Trust, Safety & Co',
    },
  ]);

  assert.match(csv, /registration_code,first_name,organization/);
  assert.match(csv, /EVT-001,Ada,"Trust, Safety & Co"/);
});

test('buildExcelExport returns an xlsx buffer', async () => {
  if (!badgeExportUtils) {
    badgeExportUtils = require('../src/lib/badge-export-utils.cjs');
  }

  const buffer = await badgeExportUtils.buildExcelExport([
    {
      registration_code: 'EVT-001',
      first_name: 'Ada',
      status: 'confirmed',
    },
  ]);

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
});

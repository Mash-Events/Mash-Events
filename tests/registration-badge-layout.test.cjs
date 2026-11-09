const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getBadgeLowerSectionLayout,
  getBadgeTierTheme,
  normalizeBadgeSingleLine,
} = require('../src/lib/registration-badge-layout.cjs');

test('uses the registration badge color hex for the tier bar theme', () => {
  assert.deepEqual(
    getBadgeTierTheme({
      badgeColorHex: '#6D28D9',
      badgeColorLabel: 'Purple',
    }),
    {
      label: 'PURPLE TIER',
      fillColor: [109, 40, 217],
      dotColor: [109, 40, 217],
      textColor: [255, 255, 255],
    }
  );
});

test('normalizes badge text to a single trimmed line', () => {
  assert.equal(
    normalizeBadgeSingleLine('Example Events\n Collective   '),
    'Example Events Collective'
  );
});

test('truncates overly long single-line badge text with an ellipsis', () => {
  assert.equal(
    normalizeBadgeSingleLine(
      'An Extremely Long Organization Name That Will Not Fit',
      24
    ),
    'An Extremely Long Org...'
  );
});

test('positions policy rules on the left and scan label beneath the qr block', () => {
  assert.deepEqual(getBadgeLowerSectionLayout(), {
    entryPassLabelY: 97.4,
    policyTitleY: 105.3,
    policyRuleYs: [110, 114.3, 118.6],
    qrBox: {
      x: 60,
      y: 96.2,
      width: 32.5,
      height: 32.5,
    },
    qrCode: {
      x: 62,
      y: 98.2,
      width: 28.2,
      height: 28.2,
    },
    qrRegistrationCodeY: 131.6,
    scanLabelY: 137.2,
  });
});

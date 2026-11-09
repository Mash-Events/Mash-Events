function hexToRgb(hex, fallback = [34, 69, 126]) {
  const value = String(hex || '')
    .trim()
    .replace(/^#/, '');

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return fallback;
  }

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function normalizeBadgeSingleLine(value, maxLength = 32) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getBadgeTierTheme({ badgeColorHex, badgeColorLabel } = {}) {
  const fillColor = hexToRgb(badgeColorHex);

  return {
    label: `${String(badgeColorLabel || 'Delegate').toUpperCase()} TIER`,
    fillColor,
    dotColor: fillColor,
    textColor: [255, 255, 255],
  };
}

function getBadgeLowerSectionLayout() {
  return {
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
  };
}

module.exports = {
  getBadgeLowerSectionLayout,
  getBadgeTierTheme,
  normalizeBadgeSingleLine,
};

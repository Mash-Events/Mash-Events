// CI security gate: fails on any high or critical npm advisory, except the
// ones listed below. Each exception needs a reason and an expiry date; once
// it expires the advisory fails CI again, so nothing is ignored forever.
//
// Usage: node scripts/audit-check.mjs

import { execSync } from 'node:child_process';

const ALLOWED_ADVISORIES = [
  {
    id: 'GHSA-vfj7-8cjw-p6xm',
    package: 'braces',
    reason:
      'No patched version exists. Only reached through build and editor tooling (tailwindcss, eslint-config-next) on fixed glob patterns; it needs attacker-controlled patterns to trigger and the app never passes user input to it.',
    expires: '2026-11-30',
  },
];

const FAILING_SEVERITIES = new Set(['high', 'critical']);

function runAudit() {
  try {
    return execSync('npm audit --json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

function advisoryId(via) {
  const match = String(via.url || '').match(/GHSA-[\w-]+/);
  return match ? match[0] : String(via.source);
}

const report = JSON.parse(runAudit());
const now = new Date();
const allowed = new Map(ALLOWED_ADVISORIES.map((item) => [item.id, item]));

const expired = ALLOWED_ADVISORIES.filter(
  (item) => new Date(`${item.expires}T23:59:59Z`) < now
);

const findings = new Map();
for (const vulnerability of Object.values(report.vulnerabilities || {})) {
  for (const via of vulnerability.via) {
    if (typeof via !== 'object') continue;
    if (!FAILING_SEVERITIES.has(via.severity)) continue;
    const id = advisoryId(via);
    findings.set(id, {
      id,
      severity: via.severity,
      title: via.title,
      name: via.name,
    });
  }
}

const blocking = [...findings.values()].filter((finding) => {
  const exception = allowed.get(finding.id);
  return !exception || expired.includes(exception);
});

for (const finding of findings.values()) {
  const exception = allowed.get(finding.id);
  if (exception && !expired.includes(exception)) {
    console.log(
      `Allowed until ${exception.expires}: ${finding.id} (${finding.name}) - ${exception.reason}`
    );
  }
}

if (expired.length) {
  console.error(
    `Expired audit exceptions, review and remove: ${expired.map((item) => item.id).join(', ')}`
  );
}

if (blocking.length) {
  console.error('High or critical advisories:');
  for (const finding of blocking) {
    console.error(
      `- ${finding.id} ${finding.severity} ${finding.name}: ${finding.title}`
    );
  }
  process.exit(1);
}

console.log('npm audit: no blocking high or critical advisories.');

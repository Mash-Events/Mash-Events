// Request bodies may never choose the event or org (docs/system-design.md
// §12.4): those come from the URL path only. Pure, so it is unit-tested.

const FORBIDDEN = new Set([
  'event_id',
  'eventid',
  'org_id',
  'orgid',
  'organization_id',
  'organisation_id',
]);

function normalise(key: string) {
  return key.toLowerCase().replace(/[-\s]/g, '_');
}

/** Returns every forbidden key found anywhere in the body (any depth). */
export function findTenancyKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findTenancyKeys(item, `${path}[${index}]`)
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => {
        const here = path ? `${path}.${key}` : key;
        const own =
          FORBIDDEN.has(normalise(key)) ||
          FORBIDDEN.has(normalise(key).replace(/_/g, ''))
            ? [here]
            : [];
        return [...own, ...findTenancyKeys(child, here)];
      }
    );
  }
  return [];
}

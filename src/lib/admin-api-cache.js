export const ADMIN_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

export function adminJson(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...ADMIN_NO_STORE_HEADERS,
      ...(init.headers || {}),
    },
  });
}

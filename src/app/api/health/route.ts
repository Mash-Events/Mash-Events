// Public health check: status only, no configuration details (design §13).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

import { NextResponse } from 'next/server';

/** Keep local identity fixtures unreachable from a production web deployment. */
export function devIdentityRouteGuard(): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null;
  return new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

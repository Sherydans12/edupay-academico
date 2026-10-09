import { NextResponse } from 'next/server';
import { DEV_JWKS } from '@/dev-identity/dev-auth';
import { devIdentityRouteGuard } from '@/dev-identity/dev-route-guard';

export async function GET() {
  const unavailable = devIdentityRouteGuard();
  if (unavailable) return unavailable;

  return NextResponse.json(DEV_JWKS, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json',
    },
  });
}

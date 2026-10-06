import { NextResponse } from 'next/server';
import { DEV_JWKS } from '@/dev-identity/dev-auth';

export async function GET() {
  return NextResponse.json(DEV_JWKS, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json',
    },
  });
}

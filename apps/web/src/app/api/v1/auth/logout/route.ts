import { NextResponse } from 'next/server';
import { devIdentityRouteGuard } from '@/dev-identity/dev-route-guard';

export async function POST() {
  const unavailable = devIdentityRouteGuard();
  if (unavailable) return unavailable;

  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete('edupay_dev_user');
  return response;
}

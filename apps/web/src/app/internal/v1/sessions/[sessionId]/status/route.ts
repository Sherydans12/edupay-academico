import { NextRequest, NextResponse } from 'next/server';
import { DEV_ACCOUNTS } from '@/dev-identity/dev-auth';
import { devIdentityRouteGuard } from '@/dev-identity/dev-route-guard';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const unavailable = devIdentityRouteGuard();
  if (unavailable) return unavailable;

  const { sessionId } = await params;

  let account = Object.values(DEV_ACCOUNTS)[0]!;
  for (const acc of Object.values(DEV_ACCOUNTS)) {
    if (sessionId.includes(acc.username) || sessionId.includes(acc.id)) {
      account = acc;
      break;
    }
  }

  return NextResponse.json({
    active: true,
    identityUserId: account.id,
    membershipActive: true,
    membershipId: account.membershipId,
    sessionActive: true,
    sessionId,
    tenantId: account.tenantId,
  });
}

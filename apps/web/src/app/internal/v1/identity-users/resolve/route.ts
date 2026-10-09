import { NextRequest, NextResponse } from 'next/server';
import { DEV_ACCOUNTS } from '@/dev-identity/dev-auth';
import { devIdentityRouteGuard } from '@/dev-identity/dev-route-guard';

export async function POST(request: NextRequest) {
  const unavailable = devIdentityRouteGuard();
  if (unavailable) return unavailable;

  const body = await request.json().catch(() => ({}));
  const { targetIdentityUserId } = body as {
    targetIdentityUserId?: string;
  };

  const account = Object.values(DEV_ACCOUNTS).find(
    (acc) => acc.id === targetIdentityUserId || acc.username === targetIdentityUserId,
  );

  if (!account) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    verified: true,
    identityUserId: account.id,
    membershipId: account.membershipId,
    tenantId: account.tenantId,
    membershipStatus: 'ACTIVE',
    roles: [account.role],
  });
}

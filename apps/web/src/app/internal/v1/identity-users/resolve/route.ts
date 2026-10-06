import { NextRequest, NextResponse } from 'next/server';
import { DEV_ACCOUNTS } from '@/dev-identity/dev-auth';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { targetIdentityUserId, expectedRole } = body as {
    targetIdentityUserId?: string;
    expectedRole?: string;
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

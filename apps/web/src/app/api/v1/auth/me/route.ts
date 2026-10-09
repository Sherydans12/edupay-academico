import { NextRequest, NextResponse } from 'next/server';
import { DEV_ACCOUNTS } from '@/dev-identity/dev-auth';
import { devIdentityRouteGuard } from '@/dev-identity/dev-route-guard';

export async function GET(request: NextRequest) {
  const unavailable = devIdentityRouteGuard();
  if (unavailable) return unavailable;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  let account = Object.values(DEV_ACCOUNTS)[0]!;

  if (token) {
    try {
      const parts = token.split('.');
      if (parts[1]) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const found = Object.values(DEV_ACCOUNTS).find((a) => a.id === payload.sub);
        if (found) account = found;
      }
    } catch {
      // fallback
    }
  }

  return NextResponse.json({
    userId: account.id,
    status: 'ACTIVE',
    platformRoles: [],
    session: {
      id: `demo-session-${account.username}`,
      authenticatedAt: new Date().toISOString(),
      activeMembership: {
        membershipId: account.membershipId,
        tenantId: account.tenantId,
        tenantHandle: account.tenantHandle,
        status: 'ACTIVE',
        roles: [account.role],
      },
    },
  });
}

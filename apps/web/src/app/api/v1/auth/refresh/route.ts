import { NextRequest, NextResponse } from 'next/server';
import { DEV_ACCOUNTS, signDevAccessToken } from '@/dev-identity/dev-auth';
import { devIdentityRouteGuard } from '@/dev-identity/dev-route-guard';

export async function POST(request: NextRequest) {
  const unavailable = devIdentityRouteGuard();
  if (unavailable) return unavailable;

  try {
    const devUsername = request.cookies.get('edupay_dev_user')?.value;
    const account = devUsername && DEV_ACCOUNTS[devUsername] ? DEV_ACCOUNTS[devUsername] : null;

    if (!account) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'No active session cookie found.',
            details: [],
            requestId: crypto.randomUUID(),
          },
        },
        { status: 401 },
      );
    }

    const tokenData = signDevAccessToken(account);

    const response = NextResponse.json(
      {
        accessToken: tokenData.accessToken,
        tokenType: 'Bearer',
        expiresIn: tokenData.expiresIn,
        sessionId: tokenData.sessionId,
        activeMembership: {
          membershipId: account.membershipId,
          tenantId: account.tenantId,
          tenantHandle: account.tenantHandle,
          status: 'ACTIVE',
          roles: [account.role],
        },
      },
      { status: 200 },
    );

    response.cookies.set('edupay_dev_user', account.username, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Error al refrescar sesión',
          details: [],
          requestId: crypto.randomUUID(),
        },
      },
      { status: 500 },
    );
  }
}

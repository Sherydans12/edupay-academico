import { NextRequest, NextResponse } from 'next/server';
import { findDevAccount, signDevAccessToken, DEV_ACCOUNTS } from '@/dev-identity/dev-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { identifier, password } = body as { identifier?: string; password?: string };

    if (!identifier) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'El identificador es obligatorio.',
            details: [],
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }

    const account = findDevAccount(identifier);

    if (!account) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Usuario no encontrado. Usa admin, profesor o alumno en desarrollo.',
            details: [],
            requestId: crypto.randomUUID(),
          },
        },
        { status: 401 },
      );
    }

    // In local dev, accept standard dev passwords (e.g. admin123456) or any password if matching username
    const validPassword =
      password === `${account.username}123456` ||
      password === 'admin123456' ||
      password === 'password123' ||
      password === account.username;

    if (password && !validPassword) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: `Contraseña incorrecta. La contraseña de prueba para ${account.username} es ${account.username}123456`,
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

    // Set a dev refresh cookie
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
          message: error instanceof Error ? error.message : 'Error al procesar login',
          details: [],
          requestId: crypto.randomUUID(),
        },
      },
      { status: 500 },
    );
  }
}

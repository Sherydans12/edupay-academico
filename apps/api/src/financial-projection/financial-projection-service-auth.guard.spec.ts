import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FinancialProjectionServiceAuthGuard } from './financial-projection-service-auth.guard';

describe('FinancialProjectionServiceAuthGuard', () => {
  const credential = {
    keyId: 'bl-shadow-2026-01',
    token: 'a-registered-service-secret-with-at-least-32-characters',
    canonicalTenantId: '11111111-1111-4111-8111-111111111111',
  };

  function context(headers: Record<string, string>) {
    const request = {
      header: vi.fn((name: string) => headers[name.toLowerCase()]),
      requestId: 'test-request',
    };
    return {
      request,
      execution: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }

  it('accepts only a registered BL shadow credential and binds its tenant', () => {
    const guard = new FinancialProjectionServiceAuthGuard({
      requireInboundCredentials: () => [credential],
    } as never);
    const input = context({
      authorization: `Bearer ${credential.token}`,
      'x-edupay-service': 'BL_SHADOW',
      'x-edupay-service-key-id': credential.keyId,
    });
    expect(guard.canActivate(input.execution)).toBe(true);
    expect(
      (
        input.request as typeof input.request & {
          financialProjectionPrincipal?: unknown;
        }
      ).financialProjectionPrincipal,
    ).toEqual({
      service: 'BL_SHADOW',
      keyId: credential.keyId,
      canonicalTenantId: credential.canonicalTenantId,
    });
  });

  it('rejects an ordinary user JWT even when the service header is forged', () => {
    const guard = new FinancialProjectionServiceAuthGuard({
      requireInboundCredentials: () => [credential],
    } as never);
    expect(() =>
      guard.canActivate(
        context({
          authorization: 'Bearer header.payload.signature',
          'x-edupay-service': 'BL_SHADOW',
          'x-edupay-service-key-id': credential.keyId,
        }).execution,
      ),
    ).toThrow(UnauthorizedException);
  });
});

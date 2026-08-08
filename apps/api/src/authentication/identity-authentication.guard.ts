import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  IDENTITY_ACCESS_TOKEN_VERIFIER,
  type IdentityAccessTokenVerifier,
} from '../identity/identity-adapter.port';
import { IS_PUBLIC_ENDPOINT } from './authentication.constants';

@Injectable()
export class IdentityAuthenticationGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_ACCESS_TOKEN_VERIFIER)
    private readonly verifier: IdentityAccessTokenVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ENDPOINT,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const accessToken = this.readBearerToken(request);
    request.principal = await this.verifier.validateAccessToken(accessToken);
    return true;
  }

  private readBearerToken(request: Request): string {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);

    if (!match?.[1]) {
      throw new UnauthorizedException('A valid access token is required.');
    }

    return match[1];
  }
}

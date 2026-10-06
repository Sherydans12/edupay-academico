import crypto from 'node:crypto';

export const DEV_KEY_ID = 'dev-key-1';

export const DEV_PUBLIC_JWK = {
  kty: 'RSA',
  n: 'unxKrYeN8BQ9IM5HxGd-BTimlhz0QI9CDubJxDL7yzj7ud8986ijcPN0coBxAgq3dUiyklkdZrTAILZleXeUsgNeiAOS5gS9C009Lj3CeZ8SZTouaCCKwBF8UVdmO9AU4B_D0piBhqJkEgS_Umtkrgcb5mrg7NxOsHDvdAOd7dy2WSOLIECqIbP0pUcW1oKFJwt4Yry4cJm9Su4bQt0pAYmhfmh9cutxL6rgeopi_oj2Oksh_lwOtDnaJkSy-6Dk-aqBKt8DecL6zVEPlhkiSF9E3PBw49H-oNkttBW9s45ukFAoJGc0iRH7j3D37mnIwVc4tvIx29KU_Qj4c_fmVw',
  e: 'AQAB',
  kid: DEV_KEY_ID,
  alg: 'RS256',
  use: 'sig',
} as const;

export const DEV_JWKS = {
  keys: [DEV_PUBLIC_JWK],
};

export const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6fEqth43wFD0g
zkfEZ34FOKaWHPRAj0IO5snEMvvLOPu53z3zqKNw83RygHECCrd1SLKSWR1mtMAg
tmV5d5SyA16IA5LmBL0LTT0uPcJ5nxJlOi5oIIrAEXxRV2Y70BTgH8PSmIGGomQS
BL9Sa2SuBxvmauDs3E6wcO90A53t3LZZI4sgQKohs/SlRxbWgoUnC3hivLhwmb1K
7htC3SkBiaF+aH1y63EvquB6imL+iPY6SyH+XA60OdomRLL7oOT5qoEq3wN5wvrN
UQ+WGSJIX0Tc8HDj0f6g2S20Fb2zjm6QUCgkZzSJEfuPcPfuacjBVzi28jHb0pT9
CPhz9+ZXAgMBAAECggEALcOgw/MXJwqgcbONsyo+p+NeJkqWul0tteB3NVnZpuam
B9g8KNaCvY5RTmQs13ZvzS14/Sc3auQCnkSEpIlvCTyAb1qJKz+QcPyUfguT9SrP
Zd4gU1dhFX91BbUwFo+a/+FrufvJFZQ2gKF/nidSvs5pz2L9LcNm4C/m446brCpp
loSW64r7EQVslNnwST2Uj0fvZt3wGV7j53QHHMkM4XQUMMbKd4aWFZDRPJsoCG+l
T8v161muAulT7mSRuDvpZw1hgGioDDa11+iVOXz5nbreIEremCtTj5o540L6ocVq
U4sOWIAOY+OSaNb0g2SLDfzyavW11D9Na42l3PijaQKBgQDjR8eHLY3+G7B31tl9
gLEN68XKTPY/GGDVOiaWmP3fq1leaKeziNJm/VbZwZnWChT5q2NpX9w2pl23DSnQ
VjGwjjYlItQLCd8r4HS+9F5Hv7OWpYDUkMjEOqIPeL0AFQb8H9oSrwh+/krJ5Zt+
eDyNn8ajxbuw4+KJYQfnoNe/IwKBgQDSDNobN5sm+Dy7oMjZ9QbGwdiebOr1EN1Y
V3QudS7Ux/+wDthf3hRNeiY0ADIatMGzD3dE4OnM7zKSPO1cFVsPIDNL0J2ogHa5
qmYHyt+OvWGmnxMNdv6pymMXE78HHS7tvII29K/jyHmDH0x3sHMRzQ8ig2mWD01o
Bz0hp85pPQKBgEk5BOVeHdLyJMZXJ7axUVmEzjJA3Uyyk+/eTjRSkegPkjlCSlUj
DXY0xFhfcSpuERfmyZ5XTeEldCfXS9NdEaEqD/Oi5uGvioDeTX5/yCghcMBmDb1t
7+CYa0HEyk9OdvOfZ2iBj6EqV/n3yULThd6yzRJSUAfLQ16zLhLH1Po1AoGBAKR5
ZcuMFhREqqGsu7lXUPAPV8RtuukcRIXpLNM39OyuknrUlP80USd9ry5mvNUGlunU
AWtQxiIvZqT1ylKhckT8zM3f06Peu5iUYgJWDAmkJzOmOfAALlbbYA3w61Lxug5z
3m6T2Kp/Dw7qUiEibGgS7nfy+JmE7/K2QFr7H/htAoGAWO7WDCVSsoY+mABGkgeI
EAPKQbT6RBWTgiiUV5khLw7AWnqAnm+Dm4y5aYGXURu0Sid3a3paUcl8TV8yvS8W
pxruF2SJCh5rwKbglWDkUeIsqdY0QR++9JQ9pn+ptJn/r499WDta1SMs/CLP76hL
Jesx34548DLtJN4+Ruspuko=
-----END PRIVATE KEY-----`;

export interface DevUserAccount {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: 'TENANT_ADMIN' | 'TEACHER' | 'STUDENT';
  readonly roleLabel: string;
  readonly workspace: 'tenant-admin' | 'teacher' | 'student';
  readonly membershipId: string;
  readonly tenantId: string;
  readonly tenantHandle: string;
  readonly tenantDisplayName: string;
}

export const CANONICAL_DEV_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const CANONICAL_DEV_TENANT_HANDLE = 'colegio-conquistadores';
export const CANONICAL_DEV_TENANT_NAME = 'Colegio Conquistadores';

export const DEV_ACCOUNTS: Record<string, DevUserAccount> = {
  admin: {
    id: 'demo-user-admin',
    username: 'admin',
    email: 'admin@edupay.local',
    displayName: 'Martín Silva',
    role: 'TENANT_ADMIN',
    roleLabel: 'Administración académica',
    workspace: 'tenant-admin',
    membershipId: 'demo-membership-admin',
    tenantId: CANONICAL_DEV_TENANT_ID,
    tenantHandle: CANONICAL_DEV_TENANT_HANDLE,
    tenantDisplayName: CANONICAL_DEV_TENANT_NAME,
  },
  profesor: {
    id: 'demo-user-teacher',
    username: 'profesor',
    email: 'profesor@edupay.local',
    displayName: 'Camila Rojas',
    role: 'TEACHER',
    roleLabel: 'Docente',
    workspace: 'teacher',
    membershipId: 'demo-membership-teacher',
    tenantId: CANONICAL_DEV_TENANT_ID,
    tenantHandle: CANONICAL_DEV_TENANT_HANDLE,
    tenantDisplayName: CANONICAL_DEV_TENANT_NAME,
  },
  alumno: {
    id: 'demo-user-student',
    username: 'alumno',
    email: 'alumno@edupay.local',
    displayName: 'Sofía Herrera',
    role: 'STUDENT',
    roleLabel: 'Estudiante · 7º Básico A',
    workspace: 'student',
    membershipId: 'demo-membership-student',
    tenantId: CANONICAL_DEV_TENANT_ID,
    tenantHandle: CANONICAL_DEV_TENANT_HANDLE,
    tenantDisplayName: CANONICAL_DEV_TENANT_NAME,
  },
};

export function findDevAccount(identifier: string): DevUserAccount | undefined {
  const normalized = identifier.trim().toLowerCase();
  for (const account of Object.values(DEV_ACCOUNTS)) {
    if (
      account.username.toLowerCase() === normalized ||
      account.email.toLowerCase() === normalized ||
      account.id.toLowerCase() === normalized
    ) {
      return account;
    }
  }
  return undefined;
}

export function signDevAccessToken(account: DevUserAccount): {
  accessToken: string;
  expiresIn: number;
  sessionId: string;
} {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 600; // 10 minutes (strictly valid under MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS = 600)
  const sessionId = `demo-session-${account.username}`;

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: DEV_KEY_ID,
  };

  const payload = {
    iss: 'http://localhost:3000',
    aud: 'edupay-academico-api',
    sub: account.id,
    sid: sessionId,
    jti: crypto.randomUUID(),
    roles: [account.role],
    tenant_id: account.tenantId,
    membership_id: account.membershipId,
    iat: now,
    nbf: now,
    exp: now + expiresIn,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(DEV_PRIVATE_KEY_PEM, 'base64url');

  const accessToken = `${signingInput}.${signature}`;

  return {
    accessToken,
    expiresIn,
    sessionId,
  };
}

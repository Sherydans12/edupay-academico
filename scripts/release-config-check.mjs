import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const service = valueAfter('--service') ?? process.env.RELEASE_CONFIG_SERVICE;
const envFile = valueAfter('--env-file');

if (!['academico', 'identity', 'edupay'].includes(service ?? '')) {
  throw new Error(
    'Usage: node scripts/release-config-check.mjs --service <academico|identity|edupay> [--env-file <path>]',
  );
}

const environment = {
  ...process.env,
  ...(envFile ? parseEnv(await readFile(envFile, 'utf8')) : {}),
};

const required = {
  academico: [
    'DATABASE_URL',
    'IDENTITY_ISSUER',
    'IDENTITY_JWKS_URI',
    'IDENTITY_INTERNAL_BASE_URL',
    'IDENTITY_INTERNAL_SERVICE_TOKEN',
    'ACADEMIC_TRUSTED_WEB_ORIGINS',
    'STORAGE_ROOT',
    'STORAGE_TEMP_ROOT',
    'STORAGE_MIN_FREE_BYTES',
    'STORAGE_MIN_FREE_PERCENTAGE',
    'ACADEMIC_MALWARE_SCANNER',
    'ACADEMIC_CLAMAV_HOST',
    'ACADEMIC_CLAMAV_PORT',
    'ACADEMIC_CLAMAV_TIMEOUT_MS',
    'ACADEMIC_MALWARE_SCAN_CONCURRENCY',
    'ACADEMIC_RESEND_API_KEY',
    'ACADEMIC_EMAIL_FROM',
    'ACADEMIC_EMAIL_MODE',
    'ACADEMIC_PUBLIC_BASE_URL',
    'EDUPAY_INTEGRATION_BASE_URL',
    'EDUPAY_INTEGRATION_TOKEN',
    'EDUPAY_SYNC_PAGE_SIZE',
    'EDUPAY_SYNC_WORKER_POLL_INTERVAL_MS',
    'EDUPAY_SYNC_INCREMENTAL_INTERVAL_MINUTES',
    'EDUPAY_SYNC_FULL_HOUR_UTC',
    'EDUPAY_SYNC_MAX_RUN_ATTEMPTS',
    'EDUPAY_SYNC_RETRY_SCHEDULE_SECONDS',
    'EDUPAY_SYNC_LEASE_SECONDS',
    'EDUPAY_SYNC_ITEM_EVIDENCE_LIMIT',
    'EDUPAY_SYNC_EVIDENCE_RETENTION_DAYS',
    'NOTIFICATION_WORKER_POLL_INTERVAL_MS',
    'NOTIFICATION_WORKER_BATCH_SIZE',
    'NOTIFICATION_MAX_DELIVERY_ATTEMPTS',
    'NOTIFICATION_PROCESSING_LEASE_SECONDS',
    'NOTIFICATION_RETRY_SCHEDULE_SECONDS',
  ],
  identity: [
    'DATABASE_URL',
    'JWT_ISSUER',
    'JWT_AUDIENCE',
    'JWT_ACCESS_TTL_SECONDS',
    'JWT_ALGORITHM',
    'JWT_KEY_ID',
    'JWT_PRIVATE_KEY_PATH',
    'JWT_PUBLIC_JWKS_PATH',
    'IDENTITY_ACADEMICO_SERVICE_TOKEN',
    'IDENTITY_PUBLIC_BASE_URL',
    'IDENTITY_TRUSTED_WEB_ORIGINS',
    'IDENTITY_COOKIE_SECURE',
    'IDENTITY_REFRESH_COOKIE_SAMESITE',
    'RESEND_API_KEY',
    'IDENTITY_EMAIL_FROM',
    'IDENTITY_OUTBOX_ENCRYPTION_KEY',
  ],
  edupay: [
    'DATABASE_URL',
    'EDUPAY_ACADEMICO_INTEGRATION_TOKEN',
    'EDUPAY_ACADEMICO_CURSOR_SECRET',
    'EDUPAY_ACADEMICO_ALLOWED_TENANTS',
  ],
};

const missing = required[service].filter((key) => !nonEmpty(environment[key]));
if (missing.length > 0) {
  throw new Error(
    `${service} release configuration is missing ${missing.length} required setting(s): ${missing.join(', ')}`,
  );
}

const failures = [];
const databaseUrl = environment.DATABASE_URL;
if (!/^postgres(?:ql)?:\/\/[^\s]+$/.test(databaseUrl))
  failures.push('DATABASE_URL must be a PostgreSQL URL');

if (service === 'academico') {
  for (const key of [
    'IDENTITY_ISSUER',
    'ACADEMIC_PUBLIC_BASE_URL',
    'EDUPAY_INTEGRATION_BASE_URL',
  ])
    requireHttpsOrigin(key, environment[key], failures);
  requireHttpsUrl('IDENTITY_JWKS_URI', environment.IDENTITY_JWKS_URI, failures);
  requireOriginList(
    'ACADEMIC_TRUSTED_WEB_ORIGINS',
    environment.ACADEMIC_TRUSTED_WEB_ORIGINS,
    failures,
  );
  requireAbsoluteDistinctPaths(
    environment.STORAGE_ROOT,
    environment.STORAGE_TEMP_ROOT,
    failures,
  );
  requireInteger(
    'ACADEMIC_CLAMAV_PORT',
    environment.ACADEMIC_CLAMAV_PORT,
    failures,
    1,
    65535,
  );
  requireInteger(
    'ACADEMIC_CLAMAV_TIMEOUT_MS',
    environment.ACADEMIC_CLAMAV_TIMEOUT_MS,
    failures,
    250,
    30000,
  );
  requireInteger(
    'ACADEMIC_MALWARE_SCAN_CONCURRENCY',
    environment.ACADEMIC_MALWARE_SCAN_CONCURRENCY,
    failures,
    1,
    4,
  );
  if (environment.ACADEMIC_MALWARE_SCANNER !== 'clamav')
    failures.push('ACADEMIC_MALWARE_SCANNER must be clamav');
  if (environment.ACADEMIC_EMAIL_MODE !== 'resend')
    failures.push('ACADEMIC_EMAIL_MODE must be resend');
  requireToken(
    'IDENTITY_INTERNAL_SERVICE_TOKEN',
    environment.IDENTITY_INTERNAL_SERVICE_TOKEN,
    failures,
    43,
  );
  requireToken(
    'EDUPAY_INTEGRATION_TOKEN',
    environment.EDUPAY_INTEGRATION_TOKEN,
    failures,
    32,
  );
  if (environment.ACADEMIC_TRUSTED_WEB_ORIGINS.includes('*'))
    failures.push('Academic trusted web origins must not use a wildcard');
} else if (service === 'identity') {
  requireHttpsOrigin('JWT_ISSUER', environment.JWT_ISSUER, failures);
  requireHttpsOrigin(
    'IDENTITY_PUBLIC_BASE_URL',
    environment.IDENTITY_PUBLIC_BASE_URL,
    failures,
  );
  requireOriginList(
    'IDENTITY_TRUSTED_WEB_ORIGINS',
    environment.IDENTITY_TRUSTED_WEB_ORIGINS,
    failures,
  );
  requireToken(
    'IDENTITY_ACADEMICO_SERVICE_TOKEN',
    environment.IDENTITY_ACADEMICO_SERVICE_TOKEN,
    failures,
    43,
  );
  if (environment.IDENTITY_COOKIE_SECURE !== 'true')
    failures.push('IDENTITY_COOKIE_SECURE must be true');
  if (
    !['lax', 'strict', 'none'].includes(
      environment.IDENTITY_REFRESH_COOKIE_SAMESITE,
    )
  )
    failures.push('IDENTITY_REFRESH_COOKIE_SAMESITE is invalid');
  if (!/^(?:RS|PS|ES)\d+$|^EdDSA$/.test(environment.JWT_ALGORITHM))
    failures.push('JWT_ALGORITHM must be asymmetric');
  requireInteger(
    'JWT_ACCESS_TTL_SECONDS',
    environment.JWT_ACCESS_TTL_SECONDS,
    failures,
    1,
    600,
  );
} else {
  requireToken(
    'EDUPAY_ACADEMICO_INTEGRATION_TOKEN',
    environment.EDUPAY_ACADEMICO_INTEGRATION_TOKEN,
    failures,
    32,
  );
  requireToken(
    'EDUPAY_ACADEMICO_CURSOR_SECRET',
    environment.EDUPAY_ACADEMICO_CURSOR_SECRET,
    failures,
    32,
  );
  if (environment.EDUPAY_ACADEMICO_ALLOWED_TENANTS.includes('*'))
    failures.push('EduPay allowed source tenants must not use a wildcard');
}

if (failures.length > 0) {
  throw new Error(
    `${service} release configuration failed ${failures.length} shape check(s): ${failures.join('; ')}`,
  );
}

console.log(
  `RELEASE CONFIG PASS ${service} (${required[service].length} required settings checked; secret values omitted)`,
);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseEnv(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    parsed[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return parsed;
}

function nonEmpty(value) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !/^<[^>]+>$/.test(value.trim())
  );
}

function requireToken(key, value, failures, minimum) {
  if (!nonEmpty(value) || value.length < minimum || /\s/.test(value))
    failures.push(
      `${key} must be a non-whitespace token of at least ${minimum} characters`,
    );
}

function requireInteger(key, value, failures, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum)
    failures.push(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
}

function requireHttpsOrigin(key, value, failures) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== '' && parsed.pathname !== '/') ||
      parsed.search ||
      parsed.hash
    )
      failures.push(`${key} must be an exact HTTPS origin`);
  } catch {
    failures.push(`${key} must be an exact HTTPS origin`);
  }
}

function requireHttpsUrl(key, value, failures) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      failures.push(
        `${key} must be an HTTPS URL without credentials, query, or fragment`,
      );
  } catch {
    failures.push(
      `${key} must be an HTTPS URL without credentials, query, or fragment`,
    );
  }
}

function requireOriginList(key, value, failures) {
  const origins = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    origins.length === 0 ||
    origins.some((origin) => origin === '*' || !isOrigin(origin))
  )
    failures.push(`${key} must contain exact HTTP(S) origins only`);
}

function isOrigin(value) {
  try {
    const parsed = new URL(value);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      (parsed.pathname === '' || parsed.pathname === '/') &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

function requireAbsoluteDistinctPaths(finalRoot, tempRoot, failures) {
  if (!isAbsolute(finalRoot) || !isAbsolute(tempRoot))
    failures.push('STORAGE_ROOT and STORAGE_TEMP_ROOT must be absolute');
  if (finalRoot === tempRoot)
    failures.push('STORAGE_ROOT and STORAGE_TEMP_ROOT must be different');
}

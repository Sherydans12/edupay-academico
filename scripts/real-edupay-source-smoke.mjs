import { execFile } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const tenantId = process.env.REAL_EDUPAY_SYNC_TENANT_ID;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

for (const key of [
  'DATABASE_URL',
  'EDUPAY_INTEGRATION_BASE_URL',
  'EDUPAY_INTEGRATION_TOKEN',
  'REAL_EDUPAY_SYNC_TENANT_ID',
]) {
  if (!process.env[key]) {
    throw new Error(`${key} is required for the optional real-source smoke.`);
  }
}
if (!uuidPattern.test(tenantId)) {
  throw new Error('REAL_EDUPAY_SYNC_TENANT_ID must be a canonical UUID.');
}

function windowsArgument(value) {
  return /[\s"&|<>^]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

async function run(mode) {
  const args = [
    '--filter',
    '@edupay/api',
    'sync:run',
    '--tenant-id',
    tenantId,
    '--mode',
    mode,
  ];
  const executable =
    process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : pnpm;
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', [pnpm, ...args].map(windowsArgument).join(' ')]
      : args;
  const status = await new Promise((resolve) => {
    execFile(
      executable,
      commandArgs,
      {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        resolve(error ? 1 : 0);
      },
    );
  });
  if (status !== 0) throw new Error(`Real-source ${mode} sync failed.`);
}

await run('incremental');
await run('full');
console.log('REAL EDUPAY SOURCE SMOKE PASS');

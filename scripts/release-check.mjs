import { execFile } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function windowsArgument(value) {
  return /[\s"&|<>^]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

const commands = [
  ['Prisma schema validation', ['db:validate']],
  ['Prisma client generation', ['db:generate']],
  ['lint', ['lint']],
  ['typecheck', ['typecheck']],
  ['tests', ['test']],
  ['production builds', ['build']],
];

if (process.env.RELEASE_RUN_DB_STATUS === '1') {
  commands.push(['Academic migration status', ['db:migrate:status']]);
  if (process.env.EDUPAY_IDENTITY_DIR) {
    commands.push([
      'Identity migration status',
      ['--dir', process.env.EDUPAY_IDENTITY_DIR, 'exec', 'prisma', 'migrate', 'status'],
    ]);
  } else {
    console.log('SKIP Identity migration status: set EDUPAY_IDENTITY_DIR with a disposable or approved deployment database.');
  }
}

if (process.env.RELEASE_RUN_PILOT_E2E === '1') {
  commands.push(['disposable cross-service pilot e2e', ['pilot:e2e']]);
}

for (const [label, args] of commands) {
  console.log(`RELEASE CHECK ${label}`);
  const result = await new Promise((resolve) => {
    const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : pnpm;
    const commandArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', [pnpm, ...args].map(windowsArgument).join(' ')]
      : args;
    execFile(
      executable,
      commandArgs,
      {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        resolve(error ? (typeof error.code === 'number' ? error.code : 1) : 0);
      },
    );
  });
  if (result !== 0) {
    console.error(`RELEASE CHECK FAILED ${label}`);
    process.exit(result);
  }
}

console.log('RELEASE CHECK PASS');

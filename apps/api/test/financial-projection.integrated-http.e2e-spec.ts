import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../src/bootstrap/configure-application';
import { ACADEMIC_AUDIT_PORT } from '../src/academic/academic-audit.port';
import { FinancialProjectionPublisherService } from '../src/financial-projection/financial-projection-publisher.service';
import { PrismaService } from '../src/persistence/prisma.service';
import { IdentityInternalFixture } from './support/identity-internal.fixture';
import { IdentityJwksFixture } from './support/identity-jwks.fixture';

const academicUrl = process.env.TEST_ACADEMIC_DATABASE_URL;
const blUrl = process.env.TEST_BL_DATABASE_URL;
const blRoot = process.env.BL002_BACKEND_ROOT;
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const tokenA = 'synthetic-academic-to-bl-tenant-a-token-0001';
const tokenB = 'synthetic-academic-to-bl-tenant-b-token-0002';

/**
 * This is intentionally a cross-repository gate: both real Nest applications
 * listen on loopback and the Academic publisher uses fetch against BL's HTTP
 * controller. It is skipped unless the runner supplies isolated PG URLs.
 */
describe.runIf(Boolean(academicUrl && blUrl && blRoot))(
  'Phase 1 Academic -> BL financial projection over real HTTP',
  () => {
    const jwks = new IdentityJwksFixture();
    const internal = new IdentityInternalFixture();
    let academic: INestApplication;
    let blProcess: ChildProcess;
    let blProcessEnv: NodeJS.ProcessEnv;
    let academicPrisma: PrismaService;
    let blPrisma: any;
    let blPool: { end(): Promise<void> } | undefined;
    let publisher: FinancialProjectionPublisherService;
    let blBaseUrl: string;

    beforeAll(async () => {
      await jwks.start();
      await internal.start();

      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: blUrl,
        JWT_SECRET: 'synthetic-bl-admin-secret-at-least-32-characters',
        ACADEMIC_FINANCIAL_PROJECTION_ENABLED: 'true',
        ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS: JSON.stringify([
          { keyId: 'academic-a', token: tokenA, canonicalTenantId: tenantA },
          { keyId: 'academic-b', token: tokenB, canonicalTenantId: tenantB },
        ]),
        ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS: JSON.stringify([
          { keyId: 'bl-a', token: tokenA, canonicalTenantId: tenantA },
          { keyId: 'bl-b', token: tokenB, canonicalTenantId: tenantB },
        ]),
        ACADEMIC_FINANCIAL_PROJECTION_BASE_URL: 'http://127.0.0.1:4102',
      });
      const port = 4101;
      blBaseUrl = `http://127.0.0.1:${port}`;
      blProcessEnv = { ...process.env, PORT: String(port) };
      blProcess = spawn(
        process.platform === 'win32' ? 'cmd.exe' : 'npm',
        process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run start:dev'] : ['run', 'start:dev'],
        {
        cwd: blRoot,
        env: blProcessEnv,
        stdio: 'pipe',
        },
      );
      await waitForHealth(`${blBaseUrl}/api/v1/health`);
      const [blClient, blAdapter, blPg] = await Promise.all([
        import(pathToFileURL(path.join(blRoot!, 'node_modules', '@prisma', 'client', 'default.js')).href),
        import(pathToFileURL(path.join(blRoot!, 'node_modules', '@prisma', 'adapter-pg', 'dist', 'index.js')).href),
        import(pathToFileURL(path.join(blRoot!, 'node_modules', 'pg', 'lib', 'index.js')).href),
      ]);
      blPool = new blPg.Pool({ connectionString: blUrl });
      blPrisma = new blClient.PrismaClient({ adapter: new blAdapter.PrismaPg(blPool) });

      Object.assign(process.env, {
        ...jwks.environment(),
        ...internal.environment(),
        DATABASE_URL: academicUrl,
        ACADEMIC_TRUSTED_WEB_ORIGINS: 'http://localhost:3000',
        ACADEMIC_MALWARE_SCANNER: 'fake',
        ACADEMIC_FINANCIAL_PROJECTION_ENABLED: 'true',
        ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS: JSON.stringify([
          { keyId: 'bl-a', token: tokenA, canonicalTenantId: tenantA },
          { keyId: 'bl-b', token: tokenB, canonicalTenantId: tenantB },
        ]),
        ACADEMIC_FINANCIAL_PROJECTION_CURSOR_SECRET:
          'synthetic-financial-projection-cursor-secret-0001',
        ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED: 'true',
        BL_FINANCIAL_PROJECTION_BASE_URL: blBaseUrl,
        BL_FINANCIAL_PROJECTION_SERVICE_KEY_ID: 'academic-a',
        BL_FINANCIAL_PROJECTION_SERVICE_TOKEN: tokenA,
        BL_FINANCIAL_PROJECTION_RETRY_SCHEDULE_SECONDS: '1',
      });
      const { AppModule } = await import('../src/app.module');
      const academicTesting = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(ACADEMIC_AUDIT_PORT)
        .useValue({ record: () => Promise.resolve() })
        .compile();
      academic = academicTesting.createNestApplication();
      configureApplication(academic);
      await academic.listen(4102, '127.0.0.1');
      academicPrisma = academic.get(PrismaService);
      publisher = academic.get(FinancialProjectionPublisherService);

      await academicPrisma.$executeRawUnsafe('TRUNCATE TABLE financial_projection_outbox_events, financial_projection_snapshot_items, financial_projection_snapshots, course_enrollments, students, courses, academic_years, tenants CASCADE');
      await blPrisma.$executeRawUnsafe('TRUNCATE TABLE academic_financial_projections, academic_financial_projection_consumed_events, academic_financial_projection_quarantine, academic_financial_projection_snapshots, tenant_canonical_mappings, tenants CASCADE');
      const mappingRole = await blPrisma.role.upsert({
        where: { name: 'HTTP_GATE_MAPPING_ADMIN' },
        update: {},
        create: { name: 'HTTP_GATE_MAPPING_ADMIN', description: 'synthetic HTTP gate only' },
      });
      const mappingUser = await blPrisma.user.upsert({
        where: { email: 'http-gate-mapping-admin@example.test' },
        update: { roleId: mappingRole.id },
        create: {
          email: 'http-gate-mapping-admin@example.test',
          password: 'not-a-production-secret',
          name: 'HTTP gate mapping admin',
          roleId: mappingRole.id,
        },
      });
      for (const [tenantId, name] of [[tenantA, 'Synthetic A'], [tenantB, 'Synthetic B']] as const) {
        await blPrisma.tenant.create({ data: { id: tenantId, slug: `synthetic-${name.at(-1)}`, name } });
        await blPrisma.tenantCanonicalMapping.create({ data: { tenantId, canonicalTenantId: tenantId, assignedByUserId: mappingUser.id, correlationId: 'http-gate', reason: 'synthetic gate' } });
      }
    });

    afterAll(async () => {
      await academic?.close();
      blProcess?.kill();
      await blPrisma?.$disconnect();
      await blPool?.end();
      await internal.close();
      await jwks.close();
      vi.unstubAllEnvs();
    });

    it('projects an HTTP-created enrollment through outbox and publisher without financial writes', async () => {
      const admin = await accessToken(tenantA, 'admin-a');
      const year = await post(admin, '/api/v1/academic-years', { label: '2026', startDate: '2026-03-01', endDate: '2026-12-20' });
      await patch(admin, `/api/v1/academic-years/${year.id}`, { status: 'ACTIVE' });
      const course = await post(admin, '/api/v1/courses', { academicYearId: year.id, label: 'A', status: 'ACTIVE' });
      const student = await post(admin, '/api/v1/students', { firstName: 'Synthetic', lastName: 'A' });
      const financialBefore = await financialCounts();
      const enrollment = await post(admin, '/api/v1/course-enrollments', { studentId: student.id, courseId: course.id });
      expect(await academicPrisma.financialProjectionOutboxEvent.count()).toBe(1);
      expect(await publisher.publishPending()).toEqual({ attempted: 1, published: 1 });
      expect(await blPrisma.academicFinancialProjection.count({ where: { academicEnrollmentId: enrollment.id } })).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);

      const outbox = await academicPrisma.financialProjectionOutboxEvent.findFirstOrThrow();
      const event = { eventId: outbox.id, eventType: outbox.eventType, schemaVersion: outbox.schemaVersion, canonicalTenantId: outbox.tenantId, aggregateType: 'ACADEMIC_ENROLLMENT', aggregateId: outbox.aggregateId, entityVersion: Number(outbox.entityVersion), occurredAt: outbox.occurredAt.toISOString(), correlationId: outbox.correlationId, payload: outbox.payload };
      const duplicate = await fetch(`${blBaseUrl}/api/integrations/academic-financial-projection/events`, { method: 'POST', headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json', 'X-EduPay-Service': 'ACADEMIC_PRODUCER', 'X-EduPay-Service-Key-Id': 'academic-a' }, body: JSON.stringify(event) });
      expect(duplicate.status).toBe(201);
      expect(await duplicate.json()).toMatchObject({ data: { outcome: 'DUPLICATE' } });

      const crossTenant = await fetch(`${blBaseUrl}/api/integrations/academic-financial-projection/events`, { method: 'POST', headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json', 'X-EduPay-Service': 'ACADEMIC_PRODUCER', 'X-EduPay-Service-Key-Id': 'academic-a' }, body: JSON.stringify({ ...event, canonicalTenantId: tenantB, payload: { ...(event.payload as object), canonicalTenantId: tenantB } }) });
      expect(crossTenant.status).toBe(403);
    });

    it('retries a temporarily unavailable real HTTP destination without duplicate shadow effects', async () => {
      const admin = await accessToken(tenantA, 'retry-admin');
      const year = await post(admin, '/api/v1/academic-years', { label: '2027', startDate: '2027-03-01', endDate: '2027-12-20' });
      await patch(admin, `/api/v1/academic-years/${year.id}`, { status: 'ACTIVE' });
      const course = await post(admin, '/api/v1/courses', { academicYearId: year.id, label: 'Retry', status: 'ACTIVE' });
      const student = await post(admin, '/api/v1/students', { firstName: 'Retry', lastName: 'Synthetic' });
      const financialBefore = await financialCounts();
      const enrollment = await post(admin, '/api/v1/course-enrollments', { studentId: student.id, courseId: course.id });
      const event = await academicPrisma.financialProjectionOutboxEvent.findFirstOrThrow({ where: { aggregateId: enrollment.id } });

      await stopBl();
      await waitForUnavailable(`${blBaseUrl}/api/v1/health`);
      expect(await publisher.publishPending()).toEqual({ attempted: 1, published: 0 });
      expect((await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('RETRY');

      blProcess = spawn(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run start:dev'] : ['run', 'start:dev'], { cwd: blRoot, env: blProcessEnv, stdio: 'pipe' });
      await waitForHealth(`${blBaseUrl}/api/v1/health`);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(await publisher.publishPending()).toEqual({ attempted: 1, published: 1 });
      expect((await academicPrisma.financialProjectionOutboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('PUBLISHED');
      expect(await blPrisma.academicFinancialProjection.count({ where: { academicEnrollmentId: enrollment.id } })).toBe(1);
      expect(await financialCounts()).toEqual(financialBefore);
    }, 30_000);

    async function post(accessToken: string, url: string, body: object) {
      const response = await request(academic.getHttpServer()).post(url).auth(accessToken, { type: 'bearer' }).send(body).expect(201);
      return response.body;
    }
    async function patch(accessToken: string, url: string, body: object) {
      const response = await request(academic.getHttpServer()).patch(url).auth(accessToken, { type: 'bearer' }).send(body).expect(200);
      return response.body;
    }
    async function accessToken(tenantId: string, userId: string) {
      const membershipId = `membership-${tenantId}-${userId}`;
      const sessionId = `session-${tenantId}-${userId}`;
      internal.registerSession({ identityUserId: userId, membershipId, sessionId, tenantId });
      return jwks.sign({ sub: userId, tenant_id: tenantId, membership_id: membershipId, sid: sessionId, roles: ['TENANT_ADMIN'] });
    }
    async function financialCounts() {
      return { charges: await blPrisma.charge.count(), payments: await blPrisma.payment.count() };
    }
    async function waitForHealth(url: string) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          const response = await fetch(url);
          if (response.ok) return;
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(`BL did not become healthy: ${String(lastError)}`);
    }
    async function waitForUnavailable(url: string) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try { await fetch(url); } catch { return; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('BL remained reachable after its controlled test shutdown.');
    }
    async function stopBl() {
      if (!blProcess?.pid) return;
      if (process.platform !== 'win32') {
        blProcess.kill();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const taskkill = spawn('taskkill.exe', ['/pid', String(blProcess.pid), '/T', '/F']);
        taskkill.once('error', reject);
        taskkill.once('close', (code) => code === 0 ? resolve() : reject(new Error(`taskkill exited ${code}`)));
      });
    }
  },
);

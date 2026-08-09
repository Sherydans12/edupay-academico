import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import type { PrivateStorageProvider } from './private-storage.port';

const keyPart = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class LocalPrivateStorageAdapter implements PrivateStorageProvider {
  private readonly root = process.env.STORAGE_ROOT
    ? join(process.env.STORAGE_ROOT)
    : join(process.cwd(), 'var', 'private-storage');

  async assertPhysicalCapacity(additionalBytes: number): Promise<void> {
    const minFreeBytes = this.requiredNumber('STORAGE_MIN_FREE_BYTES');
    const minFreePercentage = this.requiredNumber(
      'STORAGE_MIN_FREE_PERCENTAGE',
    );
    await mkdir(this.root, { recursive: true });
    const filesystem = await statfs(this.root);
    const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    const totalBytes = Number(filesystem.blocks) * Number(filesystem.bsize);
    const projectedFreeBytes = freeBytes - additionalBytes;
    const projectedFreePercentage =
      totalBytes > 0 ? (projectedFreeBytes / totalBytes) * 100 : 0;
    if (
      projectedFreeBytes < minFreeBytes ||
      projectedFreePercentage < minFreePercentage
    ) {
      throw new Error('PHYSICAL_STORAGE_SAFETY_GUARD');
    }
  }

  async stage(input: {
    tenantId: string;
    intentId: string;
    bytes: Buffer;
  }): Promise<{ storageKey: string; sizeBytes: number }> {
    await this.assertPhysicalCapacity(input.bytes.length);
    const storageKey = `tenants/${keyPart(input.tenantId)}/pending/${keyPart(input.intentId)}`;
    const target = this.absolute(storageKey);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, input.bytes, { flag: 'wx' });
    return { storageKey, sizeBytes: input.bytes.length };
  }

  async promote(input: { stagingKey: string; finalKey: string }): Promise<void> {
    const source = this.absolute(input.stagingKey);
    const target = this.absolute(input.finalKey);
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(source, target, 1);
    await rm(source, { force: true });
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.absolute(storageKey), { force: true });
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.absolute(storageKey));
  }

  private absolute(storageKey: string): string {
    if (
      storageKey.length === 0 ||
      storageKey.includes('..') ||
      storageKey.startsWith('/') ||
      storageKey.includes('\\')
    ) {
      throw new Error('Invalid private storage key.');
    }
    return join(this.root, storageKey);
  }

  private requiredNumber(name: string): number {
    const raw = process.env[name];
    const value = Number(raw);
    if (!raw || raw.trim() === '' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be configured for filesystem storage.`);
    }
    return value;
  }
}

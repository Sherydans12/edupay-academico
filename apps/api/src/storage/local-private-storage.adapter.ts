import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import {
  access,
  copyFile,
  constants as fsConstants,
  mkdir,
  rm,
  statfs,
  stat,
} from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import type { Environment } from '../config/environment';
import type { PrivateStorageProvider } from './private-storage.port';

const keyPart = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class LocalPrivateStorageAdapter implements PrivateStorageProvider {
  private readonly root: string;
  private readonly tempRoot: string;
  private readonly production: boolean;

  constructor(config: ConfigService<Environment, true>) {
    const configuredRoot = config.get('STORAGE_ROOT', { infer: true });
    const configuredTempRoot = config.get('STORAGE_TEMP_ROOT', { infer: true });
    this.root = resolve(configuredRoot ?? join(process.cwd(), 'var', 'private-storage'));
    this.tempRoot = resolve(configuredTempRoot ?? join(this.root, 'tmp'));
    this.production = config.getOrThrow('NODE_ENV') === 'production';
  }

  async onModuleInit(): Promise<void> {
    if (this.production) await this.assertReady();
  }

  async checkReadiness(): Promise<void> {
    await this.assertReady();
  }

  async assertPhysicalCapacity(additionalBytes: number): Promise<void> {
    const minFreeBytes = this.requiredNumber('STORAGE_MIN_FREE_BYTES');
    const minFreePercentage = this.requiredNumber(
      'STORAGE_MIN_FREE_PERCENTAGE',
    );
    if (additionalBytes < 0 || !Number.isFinite(additionalBytes)) {
      throw new Error('PHYSICAL_STORAGE_SAFETY_GUARD');
    }
    if (!this.production) {
      await mkdir(this.root, { recursive: true });
      await mkdir(this.tempRoot, { recursive: true });
    }
    await this.assertVolumeCapacity(this.root, additionalBytes, minFreeBytes, minFreePercentage);
    if (this.tempRoot !== this.root) {
      await this.assertVolumeCapacity(this.tempRoot, additionalBytes, minFreeBytes, minFreePercentage);
    }
  }

  async stage(input: {
    tenantId: string;
    intentId: string;
    sourcePath: string;
  }): Promise<{ storageKey: string; sizeBytes: number }> {
    const sourceStats = await stat(input.sourcePath);
    if (!sourceStats.isFile()) throw new Error('The staged upload is not a file.');
    await this.assertPhysicalCapacity(sourceStats.size);
    // Must match UploadIntent.stagingKey exactly (see reserveUpload in
    // storage.service.ts) - the intent's stagingKey is never rewritten after
    // staging, so any mismatch here orphans the physical bytes on disk when
    // a staged intent later fails or expires and cleanup removes by
    // intent.stagingKey.
    const storageKey = `tenants/${keyPart(input.tenantId)}/pending/${input.intentId}`;
    const target = this.absolute(storageKey);
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(input.sourcePath, target, 1);
    await rm(input.sourcePath, { force: true });
    return { storageKey, sizeBytes: sourceStats.size };
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

  async read(storageKey: string): Promise<Readable> {
    return createReadStream(this.absolute(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const stats = await stat(this.absolute(storageKey));
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async getVolumeStats(): Promise<{ totalBytes: number; freeBytes: number } | null> {
    try {
      const filesystem = await statfs(this.root);
      return {
        totalBytes: Number(filesystem.blocks) * Number(filesystem.bsize),
        freeBytes: Number(filesystem.bavail) * Number(filesystem.bsize),
      };
    } catch {
      return null;
    }
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

  private async assertReady(): Promise<void> {
    if (this.root === this.tempRoot) {
      throw new Error('STORAGE_TEMP_ROOT must be separate from STORAGE_ROOT.');
    }
    if (this.production && (!isAbsolute(this.root) || !isAbsolute(this.tempRoot))) {
      throw new Error('Production storage paths must be absolute.');
    }
    if (this.production) {
      this.requiredNumber('STORAGE_MIN_FREE_BYTES');
      this.requiredNumber('STORAGE_MIN_FREE_PERCENTAGE');
    }
    await this.assertDirectory(this.root);
    await this.assertDirectory(this.tempRoot);
  }

  private async assertDirectory(path: string): Promise<void> {
    const directory = await stat(path);
    if (!directory.isDirectory()) throw new Error('Configured storage path is not a directory.');
    await access(path, fsConstants.R_OK | fsConstants.W_OK);
  }

  private async assertVolumeCapacity(
    path: string,
    additionalBytes: number,
    minFreeBytes: number,
    minFreePercentage: number,
  ): Promise<void> {
    const filesystem = await statfs(path);
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

  private requiredNumber(name: string): number {
    const raw = process.env[name];
    const value = Number(raw);
    if (!raw || raw.trim() === '' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be configured for filesystem storage.`);
    }
    return value;
  }
}

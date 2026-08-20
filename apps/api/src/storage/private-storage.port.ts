import type { Readable } from 'node:stream';

export const PRIVATE_STORAGE_PROVIDER = Symbol('PRIVATE_STORAGE_PROVIDER');

export interface PrivateStorageProvider {
  assertPhysicalCapacity(additionalBytes: number): Promise<void>;
  stage(input: {
    tenantId: string;
    intentId: string;
    sourcePath: string;
  }): Promise<{ storageKey: string; sizeBytes: number }>;
  promote(input: { stagingKey: string; finalKey: string }): Promise<void>;
  remove(storageKey: string): Promise<void>;
  read(storageKey: string): Promise<Buffer | Readable>;
  exists(storageKey: string): Promise<boolean>;
  /**
   * Aggregate, non-sensitive filesystem capacity for the final storage
   * volume. Returns null when the adapter cannot safely report this (e.g. a
   * future non-filesystem-backed adapter). Never exposes host paths.
   */
  getVolumeStats(): Promise<{ totalBytes: number; freeBytes: number } | null>;
}


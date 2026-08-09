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
}

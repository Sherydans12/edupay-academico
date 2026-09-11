import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../persistence/prisma.service';

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) =>
      `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(',')}}`;
}

export function computePayloadFingerprint(payload: unknown): string {
  const canonical = stableSerialize(payload ?? {});
  return createHash('sha256').update(canonical).digest('hex');
}

export interface IdempotentExecutionResult<T> {
  status?: number | undefined;
  data: T;
}

@Injectable()
export class CommandIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(params: {
    tenantId: string;
    actorIdentityUserId: string;
    commandName: string;
    idempotencyKey?: string | null | undefined;
    payload: unknown;
    action: (
      tx: Prisma.TransactionClient,
    ) => Promise<IdempotentExecutionResult<T>>;
  }): Promise<IdempotentExecutionResult<T>> {
    const {
      tenantId,
      actorIdentityUserId,
      commandName,
      idempotencyKey,
      payload,
      action,
    } = params;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return this.prisma.$transaction(async (tx) => action(tx));
    }

    const trimmedKey = idempotencyKey.trim();
    const fingerprint = computePayloadFingerprint(payload);

    // Fast path: check if receipt already exists
    const existing = await this.prisma.commandReceipt.findUnique({
      where: {
        tenantId_actorIdentityUserId_commandName_idempotencyKey: {
          tenantId,
          actorIdentityUserId,
          commandName,
          idempotencyKey: trimmedKey,
        },
      },
    });

    if (existing) {
      if (existing.payloadFingerprint === fingerprint) {
        return {
          status: existing.responseStatus,
          data: existing.responseBody as T,
        };
      }

      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message:
          'Idempotency key has already been used with a different request payload.',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const inTxExisting = await tx.commandReceipt.findUnique({
          where: {
            tenantId_actorIdentityUserId_commandName_idempotencyKey: {
              tenantId,
              actorIdentityUserId,
              commandName,
              idempotencyKey: trimmedKey,
            },
          },
        });

        if (inTxExisting) {
          if (inTxExisting.payloadFingerprint === fingerprint) {
            return {
              status: inTxExisting.responseStatus,
              data: inTxExisting.responseBody as T,
            };
          }

          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message:
              'Idempotency key has already been used with a different request payload.',
          });
        }

        const result = await action(tx);

        await tx.commandReceipt.create({
          data: {
            tenantId,
            actorIdentityUserId,
            commandName,
            idempotencyKey: trimmedKey,
            payloadFingerprint: fingerprint,
            responseStatus: result.status ?? 200,
            responseBody: result.data as Prisma.InputJsonValue,
          },
        });

        return result;
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        const committedReceipt = await this.prisma.commandReceipt.findUnique({
          where: {
            tenantId_actorIdentityUserId_commandName_idempotencyKey: {
              tenantId,
              actorIdentityUserId,
              commandName,
              idempotencyKey: trimmedKey,
            },
          },
        });

        if (committedReceipt) {
          if (committedReceipt.payloadFingerprint === fingerprint) {
            return {
              status: committedReceipt.responseStatus,
              data: committedReceipt.responseBody as T,
            };
          }

          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message:
              'Idempotency key has already been used with a different request payload.',
          });
        }
      }

      throw error;
    }
  }
}

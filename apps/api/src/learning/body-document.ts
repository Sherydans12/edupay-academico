import { BadRequestException } from '@nestjs/common';
import {
  learningBodyDocumentSchema,
  type LearningBodyDocument,
  type LearningContentBlock,
} from '@edupay/contracts';

import type { Prisma } from '../generated/prisma/client';

export const BODY_DOCUMENT_READ_ENABLED =
  process.env.ACADEMIC_BODY_DOCUMENT_READ_ENABLED !== 'false';

export function parsePersistedBodyDocument(
  value: unknown,
): LearningBodyDocument | null {
  if (value === null || value === undefined) return null;
  const parsed = learningBodyDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseBodyDocumentForRead(
  value: unknown,
): LearningBodyDocument | null {
  return BODY_DOCUMENT_READ_ENABLED ? parsePersistedBodyDocument(value) : null;
}

export function bodyDocumentHasMeaningfulContent(
  document: LearningBodyDocument | null | undefined,
): boolean {
  return Boolean(
    document?.blocks.some((block) => {
      switch (block.type) {
        case 'TEXT':
          return block.text.trim().length > 0;
        case 'CALLOUT':
          return block.body.trim().length > 0 || Boolean(block.title?.trim());
        case 'RESOURCE':
        case 'LINK':
          return block.label.trim().length > 0;
        case 'IMAGE':
          return (
            block.altText.trim().length > 0 || Boolean(block.caption?.trim())
          );
      }
    }),
  );
}

/**
 * Compatibility projection for clients that still understand only Markdown
 * scalar fields. It intentionally emits text only; block references never
 * become storage keys or unsanitized HTML.
 */
export function bodyDocumentToLegacyText(
  document: LearningBodyDocument | null | undefined,
): string | null {
  if (!document) return null;
  const lines = document.blocks.flatMap((block) => legacyLines(block));
  const text = lines.join('\n\n').trim();
  return text || null;
}

function legacyLines(block: LearningContentBlock): string[] {
  switch (block.type) {
    case 'TEXT':
      return block.text ? [block.text] : [];
    case 'CALLOUT':
      return [
        [block.title?.trim(), block.body.trim()].filter(Boolean).join('\n\n'),
      ];
    case 'RESOURCE':
      return [
        block.description?.trim()
          ? `${block.label}\n${block.description}`
          : block.label,
      ];
    case 'LINK':
      return [`[${block.label}](${block.url})`];
    case 'IMAGE':
      return [
        block.caption?.trim()
          ? `${block.altText}\n${block.caption}`
          : block.altText,
      ];
  }
}

export async function assertBodyDocumentReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  learningItemId: string,
  document: LearningBodyDocument | null | undefined,
): Promise<void> {
  const fileObjectIds = [
    ...(document?.blocks ?? [])
      .filter(
        (
          block,
        ): block is Extract<
          LearningContentBlock,
          { type: 'RESOURCE' | 'IMAGE' }
        > => block.type === 'RESOURCE' || block.type === 'IMAGE',
      )
      .map((block) => block.fileObjectId),
  ];
  const uniqueFileObjectIds = [...new Set(fileObjectIds)];
  if (!uniqueFileObjectIds.length) return;

  const referenceCount = await tx.fileReference.count({
    where: {
      tenantId,
      learningItemId,
      referenceType: 'LEARNING_ITEM',
      fileObjectId: { in: uniqueFileObjectIds },
      fileObject: { lifecycle: 'AVAILABLE' },
    },
  });

  if (referenceCount !== uniqueFileObjectIds.length) {
    throw new BadRequestException({
      code: 'INVALID_BODY_DOCUMENT_REFERENCE',
      message: 'Uno de los recursos del contenido ya no está disponible.',
    });
  }
}

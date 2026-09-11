import { describe, expect, it, vi } from 'vitest';
import {
  learningBodyDocumentSchema,
  createLearningItemSchema,
  type LearningBodyDocument,
} from '@edupay/contracts';
import { BadRequestException } from '@nestjs/common';

import {
  assertBodyDocumentReferences,
  bodyDocumentHasMeaningfulContent,
  bodyDocumentToLegacyText,
} from './body-document';

const fileObjectId = '10000000-0000-4000-8000-000000000001';
const itemId = '10000000-0000-4000-8000-000000000002';

const resourceDocument: LearningBodyDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: 'resource-1',
      type: 'RESOURCE',
      fileObjectId,
      label: 'Guía de lectura',
    },
  ],
};

describe('Block body contracts and safety', () => {
  it('rejects XSS URLs and duplicate block ids', () => {
    expect(
      learningBodyDocumentSchema.safeParse({
        schemaVersion: 1,
        blocks: [
          { id: 'same', type: 'TEXT', text: 'Texto' },
          {
            id: 'same',
            type: 'LINK',
            label: 'Peligro',
            url: 'javascript:alert(1)',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts constrained blocks and keeps legacy text as text', () => {
    const document = learningBodyDocumentSchema.parse({
      schemaVersion: 1,
      blocks: [
        { id: 'text-1', type: 'TEXT', text: '<script>alert(1)</script>' },
        {
          id: 'link-1',
          type: 'LINK',
          label: 'Sitio',
          url: 'https://example.com',
        },
      ],
    });

    expect(bodyDocumentHasMeaningfulContent(document)).toBe(true);
    expect(bodyDocumentToLegacyText(document)).toContain('<script>');
    expect(bodyDocumentToLegacyText(document)).not.toContain(
      'dangerouslySetInnerHTML',
    );
  });

  it('allows deliverables and announcements to use block body as canonical content', () => {
    expect(
      createLearningItemSchema.safeParse({
        bodyDocument: resourceDocument,
        dueAt: '2026-08-30T12:00:00.000Z',
        instructions: null,
        title: 'Actividad por bloques',
        type: 'ASSIGNMENT',
      }).success,
    ).toBe(true);
    expect(
      createLearningItemSchema.safeParse({
        body: null,
        bodyDocument: {
          schemaVersion: 1,
          blocks: [
            { id: 'notice', type: 'CALLOUT', tone: 'INFO', body: 'Aviso' },
          ],
        },
        title: 'Aviso por bloques',
        type: 'ANNOUNCEMENT',
      }).success,
    ).toBe(true);
  });

  it('requires same-tenant available file references for resource blocks', async () => {
    const count = vi.fn().mockResolvedValue(1);
    await expect(
      assertBodyDocumentReferences(
        { fileReference: { count } } as never,
        'tenant-a',
        itemId,
        resourceDocument,
      ),
    ).resolves.toBeUndefined();
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          learningItemId: itemId,
          fileObjectId: { in: [fileObjectId] },
        }),
      }),
    );

    count.mockResolvedValue(0);
    await expect(
      assertBodyDocumentReferences(
        { fileReference: { count } } as never,
        'tenant-a',
        itemId,
        resourceDocument,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

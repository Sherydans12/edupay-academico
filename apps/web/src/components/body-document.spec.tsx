import { fireEvent, render, screen } from '@testing-library/react';
import type { LearningBodyDocument } from '@edupay/contracts';
import { describe, expect, it, vi } from 'vitest';

import { BodyDocumentRenderer } from './body-document';

const document: LearningBodyDocument = {
  schemaVersion: 1,
  blocks: [
    { id: 'text', type: 'TEXT', text: '<script>alert(1)</script>' },
    {
      id: 'link',
      type: 'LINK',
      label: 'Enlace seguro',
      url: 'https://example.com',
    },
    {
      id: 'resource',
      type: 'RESOURCE',
      fileObjectId: '10000000-0000-4000-8000-000000000001',
      label: 'Guía',
    },
  ],
};

describe('BodyDocumentRenderer', () => {
  it('renders text as React nodes and fails closed for unsafe links', () => {
    const unsafeDocument = {
      ...document,
      blocks: [
        document.blocks[0]!,
        {
          id: 'unsafe',
          type: 'LINK' as const,
          label: 'No ejecutar',
          url: 'javascript:alert(1)',
        },
      ],
    };
    const { container } = render(
      <BodyDocumentRenderer document={unsafeDocument} />,
    );

    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'No ejecutar' }).getAttribute('href'),
    ).toBe('#');
  });

  it('opens a referenced resource through the caller without exposing admin actions', () => {
    const onOpenFile = vi.fn();
    render(
      <BodyDocumentRenderer document={document} onOpenFile={onOpenFile} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir recurso Guía' }));
    expect(onOpenFile).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
    );
    expect(screen.queryByText('Publicar')).toBeNull();
    expect(screen.queryByText('Reordenar')).toBeNull();
  });
});

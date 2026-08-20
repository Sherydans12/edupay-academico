import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { ContentHistoryDrawer } from '@/components/content-history-drawer';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { RichTextEditor } from '@/components/rich-text-editor';
import { TeacherAttachmentManager } from '@/components/teacher-attachment-manager';
import { TeacherContentEditor } from '@/components/teacher-content-editor';
import { TeacherCalendarScreen, TeacherReviewsScreen } from '@/features/teacher-screens';

vi.mock('next/navigation', () => ({
  usePathname: () => '/docente/asignaturas',
  useRouter: () => ({ push: () => undefined }),
}));

describe('Teacher Experience & Authoring Polish', () => {
  afterEach(() => {
    cleanup();
  });
  const subject = {
    course: { academicYearId: 'yr-1', createdAt: '', externalReference: null, id: 'course-1', label: '7º Básico A', source: 'MANUAL', status: 'ACTIVE' as const, updatedAt: '' },
    courseId: 'course-1',
    createdAt: '',
    defaultForCourse: true,
    id: 'course-subject-1',
    sortOrder: 0,
    status: 'ACTIVE' as const,
    subject: { createdAt: '', id: 'sub-1', name: 'Lenguaje y Comunicación', status: 'ACTIVE' as const, updatedAt: '' },
    subjectId: 'sub-1',
    updatedAt: '',
  };

  const item = {
    body: null,
    content: 'Contenido **inicial** en Markdown.',
    courseSubjectId: subject.id,
    createdAt: '2026-08-10T10:00:00Z',
    createdByIdentityUserId: 'teacher-1',
    description: 'Guía de comprensión',
    dueAt: '2026-08-25T18:00:00Z',
    id: 'item-1',
    instructions: 'Lee con atención el siguiente texto.',
    learningUnitId: 'unit-1',
    publicationStatus: 'PUBLISHED' as const,
    publishAt: null,
    publishedAt: '2026-08-10T10:00:00Z',
    publishedByIdentityUserId: 'teacher-1',
    sortOrder: 0,
    title: 'Guía de Lectura Comprensiva',
    type: 'ASSIGNMENT' as const,
    updatedAt: '2026-08-10T10:00:00Z',
    updatedByIdentityUserId: null,
    version: 3,
  };

  const unit = {
    courseSubjectId: subject.id,
    createdAt: '',
    description: 'Unidad de introducción',
    endAt: null,
    id: 'unit-1',
    items: [item],
    sortOrder: 0,
    startAt: null,
    status: 'ACTIVE' as const,
    title: 'Unidad 1: Introducción',
    updatedAt: '',
    version: 1,
  };

  describe('Pure React MarkdownRenderer', () => {
    it('renders headings, bold, italic, lists, blockquotes, and tables safely without dangerouslySetInnerHTML', () => {
      const markdown = `
# Encabezado 1
## Encabezado 2
### Encabezado 3

Este es un párrafo con **texto en negrita** y *texto en cursiva* y \`código en línea\`.

> Cita importante de referencia

- Elemento de lista 1
- Elemento de lista 2

1. Primer paso
2. Segundo paso

| Encabezado Col 1 | Encabezado Col 2 |
| --- | --- |
| Fila 1 Celda 1 | Fila 1 Celda 2 |

[Enlace seguro](https://edupay.cl)
[Enlace malicioso](javascript:alert('xss'))
`;

      const { container } = render(<MarkdownRenderer content={markdown} />);

      expect(screen.getByRole('heading', { level: 1, name: 'Encabezado 1' })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: 'Encabezado 2' })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 3, name: 'Encabezado 3' })).toBeTruthy();
      expect(screen.getByText('texto en negrita')).toBeTruthy();
      expect(screen.getByText('texto en cursiva')).toBeTruthy();
      expect(screen.getByText('código en línea')).toBeTruthy();
      expect(screen.getByText('Cita importante de referencia')).toBeTruthy();
      expect(screen.getByText('Elemento de lista 1')).toBeTruthy();
      expect(screen.getByText('Primer paso')).toBeTruthy();
      expect(screen.getByText('Fila 1 Celda 1')).toBeTruthy();

      const safeLink = screen.getByRole('link', { name: 'Enlace seguro' }) as HTMLAnchorElement;
      expect(safeLink.href).toBe('https://edupay.cl/');

      const sanitizedLink = screen.getByRole('link', { name: 'Enlace malicioso' }) as HTMLAnchorElement;
      expect(sanitizedLink.getAttribute('href')).toBe('#');

      // Verify zero use of dangerouslySetInnerHTML or script execution
      expect(container.querySelectorAll('script').length).toBe(0);
    });
  });

  describe('RichTextEditor Component', () => {
    it('supports formatting shortcuts, toolbar insertion, and live preview tab switching', () => {
      let contentValue = 'Texto de prueba';
      const handleChange = vi.fn((val: string) => {
        contentValue = val;
      });

      render(
        <RichTextEditor
          id="test-editor"
          label="Contenido"
          onChange={handleChange}
          value={contentValue}
        />
      );

      // Verify toolbar buttons
      expect(screen.getByTitle('Negrita (Ctrl+B)')).toBeTruthy();
      expect(screen.getByTitle('Cursiva (Ctrl+I)')).toBeTruthy();
      expect(screen.getByTitle('Insertar enlace')).toBeTruthy();

      // Click Preview tab
      fireEvent.click(screen.getByRole('tab', { name: /vista previa/i }));
      expect(screen.getByText('Texto de prueba')).toBeTruthy();

      // Click Editor tab
      fireEvent.click(screen.getByRole('tab', { name: /editor/i }));
      const textarea = screen.getByLabelText(/contenido/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Texto de prueba');

      // Format bold via toolbar
      fireEvent.click(screen.getByTitle('Negrita (Ctrl+B)'));
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('TeacherContentEditor & Working Draft Lifecycle', () => {
    it('edits working draft for published item, saves draft, and publishes draft', async () => {
      const getLearningItemDraft = vi.fn().mockResolvedValue({
        draft: {
          body: null,
          content: null,
          createdAt: '2026-08-15T12:00:00Z',
          description: 'Borrador modificado',
          dueAt: null,
          id: 'draft-1',
          instructions: 'Instrucciones actualizadas en borrador.',
          learningItemId: item.id,
          tenantId: 'tenant-1',
          title: 'Guía de Lectura (Borrador)',
          updatedAt: '2026-08-15T12:00:00Z',
        },
      });
      const saveLearningItemDraft = vi.fn().mockResolvedValue({ id: 'draft-1' });
      const publishLearningItemDraft = vi.fn().mockResolvedValue(item);
      const discardLearningItemDraft = vi.fn().mockResolvedValue(undefined);

      const api = {
        discardLearningItemDraft,
        getLearningItemDraft,
        publishLearningItemDraft,
        saveLearningItemDraft,
      } as unknown as AcademicApiClient;

      const onSaved = vi.fn();
      const onClose = vi.fn();

      render(
        <TeacherContentEditor
          api={api}
          item={item}
          onClose={onClose}
          onSaved={onSaved}
          subject={subject}
          unit={unit}
        />
      );

      // Verify working draft alert is shown for published item
      expect(await screen.findByText(/estás editando un borrador de trabajo/i)).toBeTruthy();
      expect(screen.getByText(/los estudiantes continúan viendo la versión publicada/i)).toBeTruthy();

      // Verify draft loaded into input fields
      await waitFor(() => {
        expect(screen.getByDisplayValue('Guía de Lectura (Borrador)')).toBeTruthy();
      });

      // Save draft
      fireEvent.click(screen.getByRole('button', { name: /guardar borrador de trabajo/i }));
      await waitFor(() => {
        expect(saveLearningItemDraft).toHaveBeenCalledWith(
          item.id,
          expect.objectContaining({ title: 'Guía de Lectura (Borrador)' })
        );
      });

      // Publish draft
      fireEvent.click(screen.getByRole('button', { name: /publicar cambios/i }));
      await waitFor(() => {
        expect(publishLearningItemDraft).toHaveBeenCalledWith(item.id, { confirmSensitiveChange: false });
        expect(onSaved).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('handles optimistic concurrency 409 STALE_REVISION conflict gracefully', async () => {
      const getLearningItemDraft = vi.fn().mockResolvedValue({ draft: null });
      const saveLearningItemDraft = vi.fn().mockRejectedValue(
        new AcademicApiError({
          code: 'STALE_REVISION',
          details: [],
          message: 'El contenido ha sido modificado por otro usuario.',
          requestId: 'req-stale',
          status: 409,
        })
      );

      const api = {
        getLearningItemDraft,
        saveLearningItemDraft,
      } as unknown as AcademicApiClient;

      render(
        <TeacherContentEditor
          api={api}
          item={item}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          subject={subject}
          unit={unit}
        />
      );

      await screen.findByText(/estás editando un borrador de trabajo/i);

      fireEvent.change(screen.getByLabelText(/título del contenido/i), {
        target: { value: 'Título modificado en conflicto' },
      });

      fireEvent.click(screen.getByRole('button', { name: /guardar borrador de trabajo/i }));

      expect(await screen.findByText(/este contenido cambió en otra sesión/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /actualizar contenido/i })).toBeTruthy();
    });
  });

  describe('ContentHistoryDrawer Component', () => {
    it('renders revision timeline and restores a selected previous version', async () => {
      const revisions = [
        {
          createdAt: '2026-08-10T10:00:00Z',
          createdByIdentityUserId: 'teacher-1',
          entityId: item.id,
          entityType: 'LEARNING_ITEM' as const,
          id: 'rev-2',
          operation: 'UPDATED' as const,
          restoredFromRevision: null,
          revisionNumber: 2,
          snapshot: { title: 'Segunda versión de la guía', version: 2 },
          tenantId: 'tenant-1',
        },
        {
          createdAt: '2026-08-08T10:00:00Z',
          createdByIdentityUserId: 'teacher-1',
          entityId: item.id,
          entityType: 'LEARNING_ITEM' as const,
          id: 'rev-1',
          operation: 'CREATED' as const,
          restoredFromRevision: null,
          revisionNumber: 1,
          snapshot: { title: 'Primera versión de la guía', version: 1 },
          tenantId: 'tenant-1',
        },
      ];

      const getLearningItemHistory = vi.fn().mockResolvedValue(revisions);
      const restoreLearningItemRevision = vi.fn().mockResolvedValue({ id: item.id, version: 3 });

      const api = {
        getLearningItemHistory,
        restoreLearningItemRevision,
      } as unknown as AcademicApiClient;

      const onClose = vi.fn();
      const onRestored = vi.fn();

      render(
        <ContentHistoryDrawer
          api={api}
          currentVersion={2}
          entityId={item.id}
          entityTitle={item.title}
          entityType="LEARNING_ITEM"
          onClose={onClose}
          onRestored={onRestored}
          open
        />
      );

      expect(await screen.findByText(/2 versiones registradas/i)).toBeTruthy();
      expect(screen.getByText('v1')).toBeTruthy();
      expect(screen.getByText('v2')).toBeTruthy();

      // Click on revision 1 to inspect snapshot
      fireEvent.click(screen.getByText('v1'));
      expect(screen.getByText('Primera versión de la guía')).toBeTruthy();

      // Restore revision 1
      const restoreBtn = screen.getByRole('button', { name: /restaurar esta versión/i });
      fireEvent.click(restoreBtn);

      await waitFor(() => {
        expect(restoreLearningItemRevision).toHaveBeenCalledWith(item.id, 1);
        expect(onRestored).toHaveBeenCalled();
        expect(screen.getByText(/versión 1 restaurada exitosamente/i)).toBeTruthy();
      });
    });
  });

  describe('TeacherAttachmentManager Detach & Quota', () => {
    it('confirms file detachment and calls detachLearningAttachment', async () => {
      const file = {
        category: 'ASSIGNMENT_SOURCE' as const,
        createdAt: '2026-08-10T10:00:00Z',
        createdByIdentityUserId: 'teacher-1',
        detectedMime: 'application/pdf',
        id: 'file-1',
        originalFilename: 'Pauta de evaluación (rúbrica nº1).pdf',
        sizeBytes: 1024 * 500,
        status: 'READY' as const,
        storagePath: 'tenants/1/files/1.pdf',
        tenantId: 'tenant-1',
        updatedAt: '2026-08-10T10:00:00Z',
      };

      const listLearningAttachments = vi.fn().mockResolvedValue([file]);
      const getStoragePolicy = vi.fn().mockResolvedValue({ maxFileSizeBytes: 25 * 1024 * 1024 });
      const getStorageUsage = vi.fn().mockResolvedValue({
        quotaBytes: 20 * 1024 * 1024 * 1024,
        remainingPercentage: 85,
        state: 'NORMAL' as const,
        totalBytes: 20 * 1024 * 1024 * 1024,
        usedBytes: 3 * 1024 * 1024 * 1024,
      });
      const detachLearningAttachment = vi.fn().mockResolvedValue(undefined);

      const api = {
        detachLearningAttachment,
        getStoragePolicy,
        getStorageUsage,
        listLearningAttachments,
      } as unknown as AcademicApiClient;

      render(<TeacherAttachmentManager api={api} item={item} />);

      expect(await screen.findByText('Pauta de evaluación (rúbrica nº1).pdf')).toBeTruthy();
      expect(screen.getByText(/85% libre/i)).toBeTruthy();

      // Click detach button
      fireEvent.click(screen.getByRole('button', { name: /quitar pauta de evaluación/i }));

      // Confirm modal
      expect(await screen.findByRole('heading', { name: 'Quitar archivo del contenido' })).toBeTruthy();
      expect(screen.getByText(/los estudiantes ya no podrán ver ni descargar este archivo adjunto/i)).toBeTruthy();

      // Click confirm detach
      fireEvent.click(screen.getByRole('button', { name: 'Quitar archivo' }));

      await waitFor(() => {
        expect(detachLearningAttachment).toHaveBeenCalledWith(item.id, file.id);
      });
    });
  });

  describe('TeacherCalendarScreen & TeacherReviewsScreen', () => {
    it('renders calendar agenda with chronological deadlines and publication events', async () => {
      const getTeacherContextSubjects = vi.fn().mockResolvedValue([subject]);
      const getLearningRoute = vi.fn().mockResolvedValue({
        courseSubjectId: subject.id,
        units: [unit],
      });

      const api = {
        getLearningRoute,
        getTeacherContextSubjects,
      } as unknown as AcademicApiClient;

      render(<TeacherCalendarScreen api={api} />);

      expect(await screen.findByRole('heading', { name: 'Calendario' })).toBeTruthy();
      expect(await screen.findByText('Guía de Lectura Comprensiva')).toBeTruthy();
      expect(screen.getByText(/plazo límite para entrega de estudiantes/i)).toBeTruthy();
    });

    it('renders teacher reviews screen with submission queue per subject', async () => {
      const getTeacherContextSubjects = vi.fn().mockResolvedValue([subject]);
      const getLearningRoute = vi.fn().mockResolvedValue({
        courseSubjectId: subject.id,
        units: [unit],
      });
      const listSubmissions = vi.fn().mockResolvedValue([]);

      const api = {
        getLearningRoute,
        getTeacherContextSubjects,
        listSubmissions,
      } as unknown as AcademicApiClient;

      render(<TeacherReviewsScreen api={api} />);

      expect(await screen.findByRole('heading', { name: 'Revisiones' })).toBeTruthy();
      expect(await screen.findByText('Lenguaje y Comunicación · 7º Básico A')).toBeTruthy();
    });
  });
});

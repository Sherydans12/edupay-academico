import { describe, expect, it } from 'vitest';

import {
  MAX_FILE_SIZE_BYTES,
  FileValidationError,
  validateUploadBytes,
  validateUploadMetadata,
} from './file-validation';

describe('private upload validation', () => {
  it('accepts a valid PDF at the exact maximum size', () => {
    const bytes = Buffer.alloc(MAX_FILE_SIZE_BYTES);
    Buffer.from('%PDF-').copy(bytes);
    const result = validateUploadBytes({
      filename: 'evidence.pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      bytes,
    });
    expect(result.authoritativeSizeBytes).toBe(MAX_FILE_SIZE_BYTES);
  });

  it('rejects a file above the maximum before decoding content', () => {
    expect(() =>
      validateUploadMetadata({
        filename: 'evidence.pdf',
        mimeType: 'application/pdf',
        sizeBytes: MAX_FILE_SIZE_BYTES + 1,
      }),
    ).toThrowError(FileValidationError);
  });

  it('rejects extension and declared MIME mismatches', () => {
    expect(() =>
      validateUploadBytes({
        filename: 'evidence.pdf',
        mimeType: 'image/png',
        sizeBytes: 8,
        bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    ).toThrowError(/extension and declared MIME/);
  });

  it('rejects an invalid content signature even when metadata looks valid', () => {
    expect(() =>
      validateUploadBytes({
        filename: 'evidence.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 9,
        bytes: Buffer.from('not a pdf'),
      }),
    ).toThrowError(/content does not match/);
  });

  it('differentiates Open XML packages by their package part', () => {
    const bytes = Buffer.concat([
      Buffer.from([80, 75, 3, 4]),
      Buffer.from('[Content_Types].xml word/Document.xml'),
      Buffer.from([80, 75, 5, 6]),
    ]);
    expect(
      validateUploadBytes({
        filename: 'work.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: bytes.length,
        bytes,
      }).detectedMime,
    ).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(() =>
      validateUploadBytes({
        filename: 'work.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: bytes.length,
        bytes,
      }),
    ).toThrowError(/content does not match/);
  });

  describe('multipart filename charset recovery', () => {
    // Browsers send the raw UTF-8 bytes of a filename in the multipart
    // Content-Disposition `filename=` parameter. Multer/busboy decode HTTP
    // headers as latin1, so those bytes arrive mojibake unless re-decoded.
    // This simulates exactly that corruption for the filenames Multer would
    // hand to the application.
    const asMultipartMojibake = (utf8Filename: string): string =>
      Buffer.from(utf8Filename, 'utf8').toString('latin1');

    const spanishFilenames = [
      'Guía de estudio (Unidad 3).docx',
      'Evaluación_Química_ñoño.pdf',
      'Composición número 5 (borrador).txt',
      'Año Escolar - Educación Física.png',
    ];

    it.each(spanishFilenames)(
      'recovers the correct filename from a mojibake multipart upload: %s',
      (originalFilename) => {
        const mojibake = asMultipartMojibake(originalFilename);
        // Sanity check the fixture actually corrupts the name, otherwise the
        // test would pass without exercising the recovery path at all.
        expect(mojibake).not.toBe(originalFilename);

        const result = validateUploadMetadata({
          filename: mojibake,
          mimeType: 'application/octet-stream',
          sizeBytes: 10,
        });

        expect(result.normalizedFilename).toBe(originalFilename);
      },
    );

    it('leaves already-correct UTF-8 filenames (e.g. from a JSON body) unchanged', () => {
      const filename = 'Reporte_Matemática_2°_Medio.pdf';
      const result = validateUploadMetadata({
        filename,
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });
      expect(result.normalizedFilename).toBe(filename);
    });

    it('leaves plain ASCII filenames byte-for-byte unchanged', () => {
      const filename = 'quarterly_report_2026 (final).pdf';
      const result = validateUploadMetadata({
        filename,
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });
      expect(result.normalizedFilename).toBe(filename);
    });

    it('accepts a long but valid accented filename up to the 255-character limit', () => {
      const longName = `${'Informe de evaluación diagnóstica - Segundo Semestre '.repeat(4).slice(0, 245)}.pdf`;
      const mojibake = asMultipartMojibake(longName);
      const result = validateUploadMetadata({
        filename: mojibake,
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });
      expect(result.normalizedFilename).toBe(longName.slice(0, 255));
    });
  });

  describe('browser MIME variance', () => {
    const docxBytes = Buffer.concat([
      Buffer.from([80, 75, 3, 4]),
      Buffer.from('[Content_Types].xml word/document.xml'),
      Buffer.from([80, 75, 5, 6]),
    ]);
    const oleBytes = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225, 0, 0]);

    it('tolerates a generic application/octet-stream declaration when content proves the OOXML type', () => {
      const result = validateUploadBytes({
        filename: 'plan.docx',
        mimeType: 'application/octet-stream',
        sizeBytes: docxBytes.length,
        bytes: docxBytes,
      });
      expect(result.detectedMime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('tolerates an empty declared MIME when content proves the format', () => {
      const result = validateUploadBytes({
        filename: 'plan.docx',
        mimeType: '',
        sizeBytes: docxBytes.length,
        bytes: docxBytes,
      });
      expect(result.detectedMime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('tolerates the generic application/zip alias some platforms report for OOXML files', () => {
      const result = validateUploadBytes({
        filename: 'plan.docx',
        mimeType: 'application/zip',
        sizeBytes: docxBytes.length,
        bytes: docxBytes,
      });
      expect(result.detectedMime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('tolerates the legacy application/x-msword alias for .doc files', () => {
      const result = validateUploadBytes({
        filename: 'plan.doc',
        mimeType: 'application/x-msword',
        sizeBytes: oleBytes.length,
        bytes: oleBytes,
      });
      expect(result.detectedMime).toBe('application/msword');
    });

    it('still rejects a declared MIME that is neither the canonical type nor a known alias', () => {
      expect(() =>
        validateUploadBytes({
          filename: 'plan.docx',
          mimeType: 'text/plain',
          sizeBytes: docxBytes.length,
          bytes: docxBytes,
        }),
      ).toThrowError(/extension and declared MIME/);
    });

    it('never bypasses content/signature validation even with a tolerated generic MIME', () => {
      expect(() =>
        validateUploadBytes({
          filename: 'plan.docx',
          mimeType: 'application/octet-stream',
          sizeBytes: 9,
          bytes: Buffer.from('not a zip'),
        }),
      ).toThrowError(/content does not match/);
    });
  });
});

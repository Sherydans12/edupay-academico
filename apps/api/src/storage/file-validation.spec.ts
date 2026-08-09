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
});

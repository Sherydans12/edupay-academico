import { describe, expect, it } from 'vitest';

import {
  MAX_FILE_SIZE_BYTES,
  FileValidationError,
  validateUploadFile,
} from './file-validation';

const encoded = (bytes: Buffer): string => bytes.toString('base64');

describe('private upload validation', () => {
  it('accepts a valid PDF at the exact maximum size', () => {
    const bytes = Buffer.alloc(MAX_FILE_SIZE_BYTES);
    Buffer.from('%PDF-').copy(bytes);
    const result = validateUploadFile({
      filename: 'evidence.pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      contentBase64: encoded(bytes),
    });
    expect(result.authoritativeSizeBytes).toBe(MAX_FILE_SIZE_BYTES);
  });

  it('rejects a file above the maximum before decoding content', () => {
    expect(() =>
      validateUploadFile({
        filename: 'evidence.pdf',
        mimeType: 'application/pdf',
        sizeBytes: MAX_FILE_SIZE_BYTES + 1,
        contentBase64: 'A',
      }),
    ).toThrowError(FileValidationError);
  });

  it('rejects extension and declared MIME mismatches', () => {
    expect(() =>
      validateUploadFile({
        filename: 'evidence.pdf',
        mimeType: 'image/png',
        sizeBytes: 8,
        contentBase64: encoded(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      }),
    ).toThrowError(/extension and declared MIME/);
  });

  it('rejects an invalid content signature even when metadata looks valid', () => {
    expect(() =>
      validateUploadFile({
        filename: 'evidence.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 9,
        contentBase64: encoded(Buffer.from('not a pdf')),
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
      validateUploadFile({
        filename: 'work.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: bytes.length,
        contentBase64: encoded(bytes),
      }).detectedMime,
    ).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(() =>
      validateUploadFile({
        filename: 'work.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: bytes.length,
        contentBase64: encoded(bytes),
      }),
    ).toThrowError(/content does not match/);
  });
});

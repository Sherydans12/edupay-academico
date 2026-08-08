import { basename, extname } from 'node:path';

export const MAX_FILE_SIZE_BYTES = 25_000_000;
export const GLOBAL_QUOTA_BYTES = 20_000_000_000;
export const COLEGIO_CONQUISTADORES_QUOTA_BYTES = 20_000_000_000;

const allowedTypes = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
} as const;

export type ValidatedFile = {
  readonly originalFilename: string;
  readonly normalizedFilename: string;
  readonly extension: string;
  readonly declaredMime: string;
  readonly detectedMime: string;
  readonly declaredSizeBytes: number;
  readonly authoritativeSizeBytes: number;
  readonly bytes: Buffer;
};

export class FileValidationError extends Error {
  constructor(
    readonly code:
      | 'FILE_TOO_LARGE'
      | 'FILE_TYPE_NOT_ALLOWED'
      | 'FILE_CONTENT_MISMATCH',
    message: string,
  ) {
    super(message);
  }
}

export function validateUploadFile(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64: string;
}): ValidatedFile {
  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError('FILE_TOO_LARGE', 'The file is too large.');
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new FileValidationError('FILE_TYPE_NOT_ALLOWED', 'Invalid file size.');
  }
  if (
    !input.contentBase64 ||
    input.contentBase64.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)
  ) {
    throw new FileValidationError(
      'FILE_CONTENT_MISMATCH',
      'The uploaded content is not valid base64.',
    );
  }
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (bytes.length !== input.sizeBytes) {
    throw new FileValidationError(
      'FILE_CONTENT_MISMATCH',
      'The authoritative file size does not match the declared size.',
    );
  }
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError('FILE_TOO_LARGE', 'The file is too large.');
  }

  const originalFilename = input.filename.trim();
  const normalizedFilename = normalizeFilename(originalFilename);
  const extension = extname(normalizedFilename).toLowerCase();
  const declaredMime = input.mimeType.trim().toLowerCase();
  const expectedMime = allowedTypes[extension as keyof typeof allowedTypes];
  if (!expectedMime || expectedMime !== declaredMime) {
    throw new FileValidationError(
      'FILE_TYPE_NOT_ALLOWED',
      'The filename extension and declared MIME type are not allowed together.',
    );
  }

  validateContent(extension, bytes);
  return {
    originalFilename,
    normalizedFilename,
    extension,
    declaredMime,
    detectedMime: expectedMime,
    declaredSizeBytes: input.sizeBytes,
    authoritativeSizeBytes: bytes.length,
    bytes,
  };
}

export function allowedExtensions(): string[] {
  return Object.keys(allowedTypes);
}

function normalizeFilename(filename: string): string {
  const safe = basename(filename.replaceAll('\\', '/'))
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .replace(/[<>:"/|?*]/g, '_')
    .trim();
  if (!safe || safe === '.' || safe === '..' || !extname(safe)) {
    throw new FileValidationError(
      'FILE_TYPE_NOT_ALLOWED',
      'A safe filename with an allowed extension is required.',
    );
  }
  return safe.slice(0, 255);
}

function validateContent(extension: string, bytes: Buffer): void {
  if (extension === '.pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    mismatch();
  }
  if (
    (extension === '.jpg' || extension === '.jpeg') &&
    !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
  ) {
    mismatch();
  }
  if (
    extension === '.png' &&
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    mismatch();
  }
  if (
    extension === '.webp' &&
    !(bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WEBP')
  ) {
    mismatch();
  }
  if (extension === '.txt') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      mismatch();
    }
    const nulCount = bytes.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
    if (bytes.length > 0 && nulCount / bytes.length > 0.01) mismatch();
  }
  if (extension === '.zip' || extension.endsWith('x')) {
    validateZip(bytes);
    if (extension === '.docx') requirePackage(bytes, 'word/');
    if (extension === '.xlsx') requirePackage(bytes, 'xl/');
    if (extension === '.pptx') requirePackage(bytes, 'ppt/');
  }
  if (extension === '.doc' || extension === '.xls' || extension === '.ppt') {
    if (!bytes.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))) {
      mismatch();
    }
  }
}

function validateZip(bytes: Buffer): void {
  if (!bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) mismatch();
  const tailStart = Math.max(0, bytes.length - 65_557);
  const tail = bytes.subarray(tailStart);
  if (
    !tail.includes(Buffer.from([80, 75, 5, 6])) &&
    !tail.includes(Buffer.from([80, 75, 6, 6]))
  ) {
    mismatch();
  }
}

function requirePackage(bytes: Buffer, part: string): void {
  if (!bytes.includes(Buffer.from('[Content_Types].xml')) || !bytes.includes(Buffer.from(part))) {
    mismatch();
  }
}

function mismatch(): never {
  throw new FileValidationError(
    'FILE_CONTENT_MISMATCH',
    'The file content does not match its declared type.',
  );
}

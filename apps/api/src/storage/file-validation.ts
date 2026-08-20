import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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

/**
 * Declared MIME values that mean "the client/browser/OS could not determine a
 * specific type" rather than an actual claim about content. These are only
 * accepted because independent content/signature validation (validateContent)
 * always runs afterward and is authoritative regardless of the declared MIME.
 */
const GENERIC_DECLARED_MIME_ALIASES = new Set(['', 'application/octet-stream']);

/**
 * Legitimate alternate MIME strings some browsers/OSes report for a given
 * extension (e.g. OOXML formats are ZIP containers and some platforms report
 * the ZIP MIME instead of the specific Office MIME). Tolerated only because
 * validateContent still authoritatively checks the actual bytes.
 */
const EXTENSION_MIME_ALIASES: Partial<Record<keyof typeof allowedTypes, readonly string[]>> = {
  '.doc': ['application/x-msword', 'application/vnd.ms-word'],
  '.docx': ['application/zip', 'application/x-zip-compressed'],
  '.xls': ['application/x-excel', 'application/x-msexcel'],
  '.xlsx': ['application/zip', 'application/x-zip-compressed'],
  '.ppt': ['application/x-mspowerpoint'],
  '.pptx': ['application/zip', 'application/x-zip-compressed'],
  '.zip': ['application/x-zip-compressed', 'application/x-compressed'],
  '.jpg': ['image/pjpeg'],
  '.jpeg': ['image/pjpeg'],
};

export type UploadMetadata = {
  readonly originalFilename: string;
  readonly normalizedFilename: string;
  readonly extension: string;
  readonly declaredMime: string;
  readonly declaredSizeBytes: number;
};

export type ValidatedFile = UploadMetadata & {
  readonly detectedMime: string;
  readonly authoritativeSizeBytes: number;
  readonly sha256: string;
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

export function validateUploadMetadata(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): UploadMetadata & { readonly detectedMime: string } {
  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError('FILE_TOO_LARGE', 'The file is too large.');
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new FileValidationError('FILE_TYPE_NOT_ALLOWED', 'Invalid file size.');
  }

  const originalFilename = decodeMultipartFilename(input.filename.trim());
  const normalizedFilename = normalizeFilename(originalFilename);
  const extension = extname(normalizedFilename).toLowerCase() as keyof typeof allowedTypes;
  const declaredMime = input.mimeType.trim().toLowerCase();
  const expectedMime = allowedTypes[extension];
  if (!expectedMime) {
    throw new FileValidationError(
      'FILE_TYPE_NOT_ALLOWED',
      'The filename extension and declared MIME type are not allowed together.',
    );
  }
  const isAcceptedDeclaredMime =
    declaredMime === expectedMime ||
    GENERIC_DECLARED_MIME_ALIASES.has(declaredMime) ||
    (EXTENSION_MIME_ALIASES[extension] ?? []).includes(declaredMime);
  if (!isAcceptedDeclaredMime) {
    throw new FileValidationError(
      'FILE_TYPE_NOT_ALLOWED',
      'The filename extension and declared MIME type are not allowed together.',
    );
  }

  return {
    originalFilename,
    normalizedFilename,
    extension,
    declaredMime,
    declaredSizeBytes: input.sizeBytes,
    detectedMime: expectedMime,
  };
}

/**
 * Multer/busboy decode multipart header parameters (the `filename=` part of
 * Content-Disposition) as latin1, but browsers send the raw UTF-8 bytes of
 * the filename directly (WHATWG FormData/multipart form-data serialization),
 * not percent-encoded and not RFC 5987 `filename*=`. Any non-ASCII filename
 * (accented Spanish characters, ene with tilde, etc.) therefore arrives
 * mojibake unless it is re-decoded here. A filename that already arrived as
 * correct UTF-8 (e.g. from a JSON body) is only kept re-decoded when the
 * round-trip stays valid; otherwise the original is kept unchanged, and
 * ASCII-only filenames are never touched since latin1/utf8 agree below 0x80.
 */
function decodeMultipartFilename(filename: string): string {
  const hasNonAscii = filename.split('').some((char) => char.charCodeAt(0) > 0x7f);
  if (!hasNonAscii) return filename;
  const reDecoded = Buffer.from(filename, 'latin1').toString('utf8');
  const hasReplacementChar = reDecoded.split('').some((char) => char.charCodeAt(0) === 0xfffd);
  return hasReplacementChar ? filename : reDecoded;
}

/**
 * Bounded-memory validation helper for unit tests and trusted local fixtures.
 * The application upload path uses validateUploadFilePath instead.
 */
export function validateUploadBytes(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Buffer;
}): ValidatedFile {
  const metadata = validateUploadMetadata(input);
  if (input.bytes.length !== metadata.declaredSizeBytes) {
    throw new FileValidationError(
      'FILE_CONTENT_MISMATCH',
      'The authoritative file size does not match the declared size.',
    );
  }
  const hasContentTypesPart = input.bytes.includes(Buffer.from('[Content_Types].xml'));
  const expectedPart =
    metadata.extension === '.docx'
      ? 'word/'
      : metadata.extension === '.xlsx'
        ? 'xl/'
        : metadata.extension === '.pptx'
          ? 'ppt/'
          : undefined;
  validateContent(
    metadata.extension,
    input.bytes,
    input.bytes,
    hasContentTypesPart,
    expectedPart ? input.bytes.includes(Buffer.from(expectedPart)) : false,
    input.bytes.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0),
    input.bytes.length,
  );
  return {
    ...metadata,
    authoritativeSizeBytes: input.bytes.length,
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
  };
}

/**
 * Validates a Multer disk-staged file without converting the upload to a JSON
 * string or buffering a collection of files in application memory.
 */
export async function validateUploadFilePath(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  filePath: string;
}): Promise<ValidatedFile> {
  const metadata = validateUploadMetadata(input);
  const fileStats = await stat(input.filePath);
  if (!fileStats.isFile() || fileStats.size !== metadata.declaredSizeBytes) {
    throw new FileValidationError(
      'FILE_CONTENT_MISMATCH',
      'The authoritative file size does not match the declared size.',
    );
  }

  const hash = createHash('sha256');
  const firstBytes: Buffer[] = [];
  let firstLength = 0;
  let tail = Buffer.alloc(0);
  let searchCarry = Buffer.alloc(0);
  let hasContentTypesPart = false;
  let hasExpectedPackagePart = false;
  let nulCount = 0;
  const decoder = metadata.extension === '.txt'
    ? new TextDecoder('utf-8', { fatal: true })
    : undefined;
  let bytesRead = 0;

  try {
    for await (const chunk of createReadStream(input.filePath, {
      highWaterMark: 64 * 1024,
    })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += bytes.length;
      hash.update(bytes);

      if (firstLength < 12) {
        const prefix = bytes.subarray(0, 12 - firstLength);
        firstBytes.push(prefix);
        firstLength += prefix.length;
      }
      tail = Buffer.concat([tail, bytes]).subarray(-65_557);

      if (metadata.extension === '.zip' || metadata.extension.endsWith('x')) {
        const sample = Buffer.concat([searchCarry, bytes]);
        hasContentTypesPart ||= sample.includes(Buffer.from('[Content_Types].xml'));
        const expectedPart =
          metadata.extension === '.docx'
            ? 'word/'
            : metadata.extension === '.xlsx'
              ? 'xl/'
              : metadata.extension === '.pptx'
                ? 'ppt/'
                : undefined;
        if (expectedPart) {
          hasExpectedPackagePart ||= sample.includes(Buffer.from(expectedPart));
        }
        searchCarry = sample.subarray(-64);
      }

      if (decoder) {
        decoder.decode(bytes, { stream: true });
        for (const byte of bytes) if (byte === 0) nulCount += 1;
      }
    }
    if (decoder) decoder.decode();
  } catch (error) {
    if (error instanceof FileValidationError) throw error;
    throw new FileValidationError(
      'FILE_CONTENT_MISMATCH',
      'The file could not be read for validation.',
    );
  }

  if (bytesRead !== metadata.declaredSizeBytes) {
    throw new FileValidationError(
      'FILE_CONTENT_MISMATCH',
      'The authoritative file size does not match the declared size.',
    );
  }
  const first = Buffer.concat(firstBytes);
  validateContent(
    metadata.extension,
    first,
    tail,
    hasContentTypesPart,
    hasExpectedPackagePart,
    nulCount,
    bytesRead,
  );

  return {
    ...metadata,
    authoritativeSizeBytes: bytesRead,
    sha256: hash.digest('hex'),
  };
}

export function allowedExtensions(): string[] {
  return Object.keys(allowedTypes);
}

function normalizeFilename(filename: string): string {
  const safe = basename(filename.replaceAll('\\', '/'))
    .normalize('NFKC')
    .replace(/[ -]/g, '_')
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

function validateContent(
  extension: string,
  first: Buffer,
  tail: Buffer,
  hasContentTypesPart = false,
  hasExpectedPackagePart = false,
  nulCount = 0,
  sizeBytes = first.length,
): void {
  if (extension === '.pdf' && !first.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    mismatch();
  }
  if (
    (extension === '.jpg' || extension === '.jpeg') &&
    !(first[0] === 0xff && first[1] === 0xd8 && first[2] === 0xff)
  ) {
    mismatch();
  }
  if (
    extension === '.png' &&
    !first.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    mismatch();
  }
  if (
    extension === '.webp' &&
    !(first.subarray(0, 4).toString() === 'RIFF' &&
      first.subarray(8, 12).toString() === 'WEBP')
  ) {
    mismatch();
  }
  if (extension === '.txt' && sizeBytes > 0 && nulCount / sizeBytes > 0.01) {
    mismatch();
  }
  if (extension === '.zip' || extension.endsWith('x')) {
    if (!first.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) mismatch();
    if (
      !tail.includes(Buffer.from([80, 75, 5, 6])) &&
      !tail.includes(Buffer.from([80, 75, 6, 6]))
    ) {
      mismatch();
    }
    if (extension.endsWith('x') && (!hasContentTypesPart || !hasExpectedPackagePart)) {
      mismatch();
    }
  }
  if (extension === '.doc' || extension === '.xls' || extension === '.ppt') {
    if (!first.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))) {
      mismatch();
    }
  }
}

function mismatch(): never {
  throw new FileValidationError(
    'FILE_CONTENT_MISMATCH',
    'The file content does not match its declared type.',
  );
}

import path from 'node:path';

const IMAGE_MIME_BY_TYPE = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const EXTENSION_BY_TYPE = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
};

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

export class UploadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

function getExtensionFromName(fileName) {
  return path
    .extname(String(fileName || ''))
    .replace('.', '')
    .toLowerCase();
}

function formatMaxBytes(maxBytes) {
  if (maxBytes >= 1024 * 1024 && maxBytes % (1024 * 1024) === 0) {
    return `${maxBytes / (1024 * 1024)} MB`;
  }

  if (maxBytes >= 1024 && maxBytes % 1024 === 0) {
    return `${maxBytes / 1024}KB`;
  }

  return `${maxBytes} bytes`;
}

function fail(message) {
  throw new UploadValidationError(message);
}

export function sniffImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  return null;
}

// JPEG markers that carry no payload length, so they are skipped two bytes at
// a time rather than by a declared segment length.
const JPEG_STANDALONE_MARKERS = new Set([
  0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7,
]);

// Start Of Frame markers carry the dimensions. 0xc4 (DHT), 0xc8 (JPG) and
// 0xcc (DAC) fall inside the range but are not frame headers.
function isJpegStartOfFrame(marker) {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function readPngDimensions(buffer) {
  // 8-byte signature, 4-byte chunk length, then the IHDR chunk type.
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }

  return {
    type: 'png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer) {
  let offset = 2; // Skip the SOI marker.
  // Hard bound on segment walks. A malformed file exits the loop rather than
  // spinning on it, which is the failure mode the image-size advisories cover.
  let remainingSegments = 512;

  while (remainingSegments > 0) {
    remainingSegments -= 1;

    if (offset + 1 >= buffer.length) return null;
    if (buffer[offset] !== 0xff) return null;

    // Runs of 0xff are legal padding before a marker. This walk is bounded by
    // the buffer length, and every read below is bounds-checked first, so a
    // truncated or hostile file returns null rather than throwing.
    let marker = buffer[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      if (offset + 1 >= buffer.length) return null;
      marker = buffer[offset + 1];
    }

    if (JPEG_STANDALONE_MARKERS.has(marker)) {
      offset += 2;
      continue;
    }

    if (isJpegStartOfFrame(marker)) {
      if (offset + 9 > buffer.length) return null;
      return {
        type: 'jpg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    if (offset + 4 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}

// Replaces the `image-size` package, which pulled in parsers for a dozen
// formats this site never accepts. Only JPEG and PNG buffers reach this
// function - everything else is rejected by sniffImageMimeType first.
export function readImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  const mimeType = sniffImageMimeType(buffer);

  // Returning null on any parse failure keeps a malformed upload on the 400
  // path. Without this, an unexpected read error would surface as a 500.
  try {
    if (mimeType === 'image/png') return readPngDimensions(buffer);
    if (mimeType === 'image/jpeg') return readJpegDimensions(buffer);
  } catch {
    return null;
  }

  return null;
}

export async function validateUploadedImageFile(
  file,
  {
    fieldName = 'Image',
    maxBytes,
    minWidth = 1,
    minHeight = 1,
    allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES,
    allowedExtensions = ALLOWED_IMAGE_EXTENSIONS,
  } = {}
) {
  if (!(file instanceof File) || !file.size) {
    fail(`${fieldName} is required.`);
  }

  if (maxBytes && file.size > maxBytes) {
    fail(`${fieldName} must be ${formatMaxBytes(maxBytes)} or smaller.`);
  }

  const declaredType = String(file.type || '').toLowerCase();
  if (!allowedMimeTypes.has(declaredType)) {
    fail(`${fieldName} must be a JPG, JPEG, or PNG file.`);
  }

  const declaredExtension = getExtensionFromName(file.name);
  if (!declaredExtension || !allowedExtensions.has(declaredExtension)) {
    fail(`${fieldName} filename must end in .jpg, .jpeg, or .png.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffedMimeType = sniffImageMimeType(buffer);

  if (!sniffedMimeType || !allowedMimeTypes.has(sniffedMimeType)) {
    fail(`${fieldName} content must be a valid JPG or PNG image.`);
  }

  if (sniffedMimeType !== declaredType) {
    fail(`${fieldName} file type does not match its contents.`);
  }

  const dimensions = readImageDimensions(buffer);
  if (!dimensions) {
    fail(`${fieldName} content must be a readable image.`);
  }

  const detectedType = String(dimensions.type || '').toLowerCase();
  const detectedMimeType = IMAGE_MIME_BY_TYPE[detectedType] || null;
  if (detectedMimeType !== sniffedMimeType) {
    fail(`${fieldName} content must be a valid JPG or PNG image.`);
  }

  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width < minWidth ||
    dimensions.height < minHeight
  ) {
    fail(`${fieldName} must be at least ${minWidth} x ${minHeight} pixels.`);
  }

  return {
    buffer,
    contentType: sniffedMimeType,
    extension: EXTENSION_BY_TYPE[detectedType],
    dimensions,
    sizeBytes: file.size,
  };
}

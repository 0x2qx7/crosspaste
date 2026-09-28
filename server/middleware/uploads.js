import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

export function diskUpload(sizeLimit) {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        const dir = path.join(config.dataDirectory, 'incoming');
        fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir), cb);
      },
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { files: 1, ...(sizeLimit > 0 ? { fileSize: sizeLimit } : {}) },
  });
}
export async function removeIncoming(file) {
  if (file?.path) await fs.rm(file.path, { force: true }).catch(() => {});
}

// Multipart filenames from browsers are UTF-8, but Busboy defaults to latin1.
export function decodeUploadName(value) {
  if (!value || Array.from(value).some(c => c.charCodeAt(0) > 255)) return value;
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? value : decoded;
}

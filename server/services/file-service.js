import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { getDatabase } from '../database.js';
import { config } from '../config.js';
import { logger } from '../utilities/logger.js';
import {
  generateStoredFilename,
  sanitiseOriginalFilename,
  deleteFileIfExists,
  moveOrCopyFile,
} from '../utilities/files.js';

export class FileTooLargeError extends Error {
  constructor(sizeBytes) {
    super('Превышен установленный размер файла');
    this.name = 'FileTooLargeError';
    this.sizeBytes = sizeBytes;
  }
}

export class FileLimitReachedError extends Error {
  constructor() {
    super('Достигнут лимит количества файлов');
    this.name = 'FileLimitReachedError';
  }
}

export class FileNotFoundError extends Error {
  constructor() {
    super('Файл не найден');
    this.name = 'FileNotFoundError';
  }
}

function nowIso() {
  return new Date().toISOString();
}

function countFiles(db) {
  return db.prepare('SELECT COUNT(*) AS total FROM files').get().total;
}

export async function storeFile({ buffer, tempPath, originalFilename, mimeType: declaredMimeType }) {
  const sizeBytes = tempPath ? (await fs.stat(tempPath)).size : buffer.length;
  if (config.fileSizeLimitBytes > 0 && sizeBytes > config.fileSizeLimitBytes) {
    throw new FileTooLargeError(sizeBytes);
  }

  const detected = tempPath ? await fileTypeFromFile(tempPath) : await fileTypeFromBuffer(buffer);
  const mimeType = detected?.mime || declaredMimeType || 'application/octet-stream';
  let extension = detected?.ext;
  if (!extension && originalFilename) {
    const ext = path.extname(originalFilename).replace(/^\./, '').toLowerCase();
    if (ext && /^[a-z0-9]+$/i.test(ext)) {
      extension = ext;
    }
  }
  if (!extension) {
    extension = 'bin';
  }

  const storedFilename = generateStoredFilename(extension);
  const safeOriginalFilename = sanitiseOriginalFilename(originalFilename);
  const timestamp = nowIso();

  const db = getDatabase();
  const insertRow = db.transaction(() => {
    if (config.fileCountLimit > 0 && countFiles(db) >= config.fileCountLimit) {
      throw new FileLimitReachedError();
    }
    const nextSortOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM files').get().maxOrder) + 1;
    const result = db
      .prepare(
        `INSERT INTO files
          (stored_filename, original_filename, mime_type, size_bytes, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        storedFilename,
        safeOriginalFilename,
        mimeType,
        sizeBytes,
        nextSortOrder,
        timestamp
      );
    return result.lastInsertRowid;
  });

  const fileId = insertRow();

  try {
    const target = path.join(config.filesDirectory, storedFilename);
    if (tempPath) await moveOrCopyFile(tempPath, target);
    else await fs.writeFile(target, buffer);
  } catch (error) {
    db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
    await deleteFileIfExists(path.join(config.filesDirectory, storedFilename));
    logger.error('Failed to write file to disk, rolled back database row', { code: error.code });
    throw error;
  }

  return getFileById(fileId);
}

export function listFiles() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM files ORDER BY sort_order ASC').all().map(toPublicShape);
}

export function getFileById(id) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!row) throw new FileNotFoundError();
  return toPublicShape(row);
}

export function getFileRowById(id) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!row) throw new FileNotFoundError();
  return row;
}

export async function deleteFile(id) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!row) throw new FileNotFoundError();

  const fileDeleted = await deleteFileIfExists(path.join(config.filesDirectory, row.stored_filename));
  if (!fileDeleted) {
    logger.error('File deletion aborted because disk cleanup failed', { fileId: id });
    throw new Error('Unable to delete the stored file');
  }

  db.prepare('DELETE FROM files WHERE id = ?').run(id);
  return { id };
}

export function getRemainingCapacity() {
  const db = getDatabase();
  return config.fileCountLimit === 0 ? null : Math.max(0, config.fileCountLimit - countFiles(db));
}

export async function expireOldFiles(cutoffIso) {
  const db = getDatabase();
  const expired = db.prepare('SELECT * FROM files WHERE created_at < ?').all(cutoffIso);
  if (expired.length === 0) return 0;

  const deletedIds = [];
  for (const row of expired) {
    const removed = await deleteFileIfExists(path.join(config.filesDirectory, row.stored_filename));
    if (removed) {
      deletedIds.push(row.id);
    } else {
      logger.error('Expired file retained because disk cleanup failed', { fileId: row.id });
    }
  }

  if (deletedIds.length > 0) {
    const deleteRows = db.transaction((ids) => {
      for (const id of ids) db.prepare('DELETE FROM files WHERE id = ?').run(id);
    });
    deleteRows(deletedIds);
  }

  return deletedIds.length;
}

function toPublicShape(row) {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

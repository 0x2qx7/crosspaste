import { Router } from 'express';
import { diskUpload, removeIncoming, decodeUploadName } from '../middleware/uploads.js';
import path from 'node:path';
import { config } from '../config.js';
import { uploadRateLimiter } from '../middleware/rate-limits.js';
import { broadcast } from '../services/realtime-service.js';
import { logger } from '../utilities/logger.js';
import {
  storeImage,
  listImages,
  getImageById,
  getImageRowById,
  deleteImage,
  ImageNotFoundError,
} from '../services/image-service.js';

export const imagesRouter = Router();

const upload = diskUpload(config.imageSizeLimitBytes);

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

imagesRouter.get('/images', (_req, res) => {
  res.json({ images: listImages() });
});

imagesRouter.post('/images', uploadRateLimiter, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 'MISSING_FILE', message: 'Фото не выбрано.' } });
    }
    const image = await storeImage({ tempPath: req.file.path, originalFilename: decodeUploadName(req.file.originalname) });
    broadcast('images-changed', { reason: 'uploaded', imageId: image.id });
    logger.info('Image uploaded', { imageId: image.id, mimeType: image.mimeType });
    await removeIncoming(req.file);
    res.status(201).json({ image });
  } catch (error) {
    await removeIncoming(req.file);
    next(error);
  }
});

imagesRouter.get('/images/:id', (req, res, next) => {
  try {
    const image = getImageById(Number(req.params.id));
    res.json({ image });
  } catch (error) {
    next(error);
  }
});

imagesRouter.get('/images/:id/thumbnail', (req, res, next) => {
  try {
    const row = getImageRowById(Number(req.params.id));
    if (!row.thumbnail_filename) throw new ImageNotFoundError();
    res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    res.sendFile(path.join(config.thumbnailDirectory, row.thumbnail_filename));
  } catch (error) {
    next(error);
  }
});

imagesRouter.get('/images/:id/file', (req, res, next) => {
  try {
    const row = getImageRowById(Number(req.params.id));
    res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    res.setHeader('Content-Type', row.mime_type);
    res.sendFile(path.join(config.uploadDirectory, row.stored_filename));
  } catch (error) {
    next(error);
  }
});

imagesRouter.get('/images/:id/download', (req, res, next) => {
  try {
    const row = getImageRowById(Number(req.params.id));
    res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    res.download(path.join(config.uploadDirectory, row.stored_filename), row.original_filename);
  } catch (error) {
    next(error);
  }
});

imagesRouter.delete('/images/:id', async (req, res, next) => {
  try {
    const result = await deleteImage(Number(req.params.id));
    broadcast('images-changed', { reason: 'deleted', imageId: result.id });
    logger.info('Image deleted', { imageId: result.id });
    res.json({ ok: true, id: result.id });
  } catch (error) {
    next(error);
  }
});

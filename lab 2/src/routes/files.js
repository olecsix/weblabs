import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { attachmentFields, recipients, taskProject, writeTx } from './resources.js';
import { ensureAllowed, missing, projectAccess, visibility } from '../utils/access.js';
import { HttpError } from '../utils/errors.js';
import { idParams, parse, uuid } from '../utils/validation.js';

function isText(bytes) {
  try { return !new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\0'); }
  catch { return false; }
}
const jpeg = ['image/jpeg', (b) => b.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))];
const formats = {
  '.png': ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
  '.jpg': jpeg, '.jpeg': jpeg,
  '.pdf': ['application/pdf', (b) => b.subarray(0, 5).toString() === '%PDF-'],
  '.txt': ['text/plain', isText],
};

function checkedFile(file) {
  const fileName = file.originalname.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(-255);
  const format = formats[extname(fileName).toLowerCase()];
  if (!file.size || !format || file.mimetype !== format[0] || !format[1](file.buffer)) {
    throw new HttpError(415, 'FILE_TYPE', 'Дозволені непорожні PNG, JPEG, PDF і UTF-8 TXT із відповідним типом');
  }
  return { fileName, mimeType: format[0], size: file.size, content: file.buffer };
}

export function fileRoutes(prisma, config, onChange) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_FILE_SIZE, files: 4, fields: 1, fieldSize: 100, parts: 6 } });
  const multipart = (req, res, next) => {
    if (!req.is('multipart/form-data')) throw new HttpError(415, 'MEDIA_TYPE', 'Потрібен multipart/form-data');
    next();
  };
  router.post('/', multipart, upload.array('files', 4), async (req, res) => {
    const { taskId } = parse(z.strictObject({ taskId: uuid }), req.body);
    if (!req.files?.length) throw new HttpError(400, 'FILE_REQUIRED', 'Додайте файл');
    const files = req.files.map(checkedFile);
    const { data, projectId, audience } = await prisma.$transaction(async (db) => {
      const projectId = await taskProject(db, taskId);
      await projectAccess(db, projectId, req.user);
      const data = [];
      for (const file of files) {
        const id = randomUUID();
        data.push(await db.attachment.create({ data: { id, ...file, taskId, uploadedById: req.user.id, url: `/api/files/${id}` }, select: attachmentFields }));
      }
      return { data, projectId, audience: await recipients(db, projectId) };
    }, writeTx);
    for (const file of data) onChange({ resource: 'attachments', action: 'create', id: file.id, projectId, audience, actorId: req.user.id });
    res.status(201).json({ data });
  });
  router.get('/:id', async (req, res) => {
    const { id } = parse(idParams, req.params);
    const file = await prisma.attachment.findFirst({ where: { AND: [{ id }, visibility('attachments', req.user)] },
      select: { fileName: true, mimeType: true, content: true } });
    if (!file?.content) throw missing();
    res.attachment(file.fileName).type(file.mimeType).set('Cache-Control', 'private, no-store').send(Buffer.from(file.content));
  });
  router.patch('/:id', multipart, upload.single('file'), async (req, res) => {
    const { id } = parse(idParams, req.params);
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Додайте файл');
    const input = checkedFile(req.file);
    const { data, projectId, audience } = await prisma.$transaction(async (db) => {
      const old = await db.attachment.findFirst({ where: { AND: [{ id, content: { not: null } }, visibility('attachments', req.user)] },
        select: { uploadedById: true, task: { select: { projectId: true } } } });
      if (!old) throw missing();
      const { projectId } = old.task;
      ensureAllowed((await projectAccess(db, projectId, req.user)).manage || old.uploadedById === req.user.id);
      const data = await db.attachment.update({ where: { id }, data: input, select: attachmentFields });
      return { data, projectId, audience: await recipients(db, projectId) };
    }, writeTx);
    onChange({ resource: 'attachments', action: 'update', id, projectId, audience, actorId: req.user.id });
    res.json({ data });
  });
  return router;
}

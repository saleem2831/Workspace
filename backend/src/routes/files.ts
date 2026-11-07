import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { StoredFile, WorkspaceSetting } from '../models.js';
import { putPrivate, readPrivate, deletePrivate } from '../saas/storage.js';
import { ensureStorageQuota } from '../saas/limits.js';
import { HttpError, requireCompany, requirePermission, can, wrap, audit } from '../lib/security.js';

const router = Router();
const root = path.resolve(process.env.UPLOAD_DIR || './private-uploads');
const supported = new Set(['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!supported.has(file.mimetype)) return cb(new Error('Only PDF, PNG and JPEG documents are supported'));
    cb(null, true);
  },
});
const safePurpose = new Set(['offerLetterFileId','certificateFileId','documentFileId','supportingFileId','workspace-logo']);
router.post('/', upload.single('file'), wrap(async (req, res) => {
  const companyId = requireCompany(req);
  if (!req.file) throw new HttpError(400, 'Choose a file');
  const purpose = String(req.body.purpose || '');
  if (!safePurpose.has(purpose)) throw new HttpError(400, 'Unsupported document purpose');
  const domain = purpose === 'documentFileId' ? 'sales' : purpose === 'supportingFileId' ? 'projects' : purpose === 'workspace-logo' ? 'settings' : 'learning';
  requirePermission(req, domain, purpose === 'workspace-logo' ? 'admin' : 'write');
  // Magic byte verification prevents mislabeled HTML/scripts masquerading as documents.
  const content = req.file.buffer;
  const valid = req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? content.subarray(0,4).equals(Buffer.from([80,75,3,4])) && /\.docx$/i.test(req.file.originalname) : req.file.mimetype === 'application/pdf' ? content.subarray(0, 5).toString() === '%PDF-' :
    req.file.mimetype === 'image/png' ? content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    content.subarray(0, 3).equals(Buffer.from([255,216,255]));
  if (!valid) throw new HttpError(400, 'File signature does not match content type');
  await ensureStorageQuota(req.actor!.tenantId,content.length);
  const stored=await putPrivate(req.actor!.tenantId, companyId,purpose,content,req.file.mimetype);
  try {
    const record=await StoredFile.create({ companyId,uploadedBy:req.actor!.id,
      originalName:path.basename(req.file.originalname).slice(0,200),
      ...stored,mime:req.file.mimetype,size:content.length,purpose });
    await audit(req,'file.upload','files',String(record._id),{purpose,size:content.length},companyId);
    res.status(201).json({_id:record._id,originalName:record.originalName});
  } catch(error){await deletePrivate(stored);throw error;}
}));
router.get('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid document');
  const record = await StoredFile.findById(req.params.id).lean();
  if (!record) throw new HttpError(404, 'Document not found');
  if (record.purpose === 'workspace-logo') {
    const current = await WorkspaceSetting.findOne({ key:'workspace', logoFileId:record._id });
    if (!current) throw new HttpError(404,'Logo not found');
  } else if (!(req.companyIds || []).includes(String(record.companyId)) || !can(req, String(record.companyId), record.purpose === 'documentFileId' ? 'sales' : record.purpose === 'supportingFileId' ? 'projects' : 'learning', 'read')) {
    throw new HttpError(404,'Document not found');
  }
  res.setHeader('Content-Type', record.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${record.purpose === 'workspace-logo' ? 'inline' : 'attachment'}; filename="${record.originalName.replace(/["\r\n]/g, '_')}"`);
  res.send(await readPrivate(record));
}));
export default router;

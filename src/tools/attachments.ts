import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { TrilliumClient } from '../client.js';
import { extensionFor, generateFilename, getExportsDirectory } from './helpers.js';
import { EntityIdSchema, NonEmptyUpdate, PositionSchema } from './schemas.js';

const Base64Schema = z.string().min(1).refine((value) => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}, 'Expected canonical base64-encoded bytes');

export const AttachmentsGetSchema = z.object({ attachmentId: EntityIdSchema.describe('Attachment ID') });
export const AttachmentsGetContentSchema = z.object({ attachmentId: EntityIdSchema.describe('Attachment ID') });
export const AttachmentsCreateSchema = z.object({
  ownerId: EntityIdSchema.describe('Owner note ID'), role: z.string().min(1).max(255),
  mime: z.string().min(1).max(255), title: z.string().min(1).max(255),
  content: Base64Schema.describe('Base64-encoded file bytes'), position: PositionSchema.optional(),
});
export const AttachmentsUpdateSchema = NonEmptyUpdate({
  attachmentId: EntityIdSchema.describe('Attachment ID'), role: z.string().min(1).max(255).optional(),
  mime: z.string().min(1).max(255).optional(), title: z.string().min(1).max(255).optional(), position: PositionSchema.optional(),
}, 'attachmentId');
export const AttachmentsDeleteSchema = z.object({ attachmentId: EntityIdSchema.describe('Attachment ID') });
export const AttachmentsUpdateContentSchema = z.object({
  attachmentId: EntityIdSchema.describe('Attachment ID'), content: Base64Schema.describe('Base64-encoded replacement bytes'),
  mime: z.string().min(1).max(255).optional().describe('Content type; defaults to existing attachment MIME'),
});

export async function attachmentsGet(client: TrilliumClient, args: unknown): Promise<string> {
  const { attachmentId } = AttachmentsGetSchema.parse(args);
  const value = await client.getAttachment(attachmentId);
  return `Attachment ${value.attachmentId}: ${value.title}; MIME=${value.mime}; role=${value.role}; bytes=${value.contentLength ?? 'unknown'}; owner=${value.ownerId}; position=${value.position}`;
}
export async function attachmentsGetContent(client: TrilliumClient, args: unknown): Promise<string> {
  const { attachmentId } = AttachmentsGetContentSchema.parse(args);
  const metadata = await client.getAttachment(attachmentId);
  client.assertAttachmentSize(metadata.contentLength);
  const content = await client.getAttachmentContent(attachmentId);
  const directory = await getExportsDirectory();
  const filename = generateFilename(metadata.title.replace(/\.[^.]+$/, '') || 'attachment', attachmentId, extensionFor(metadata.title, metadata.mime));
  const filepath = path.resolve(directory, filename);
  if (path.dirname(filepath) !== directory) throw new Error('Refusing unsafe export path');
  await fs.writeFile(filepath, content, { flag: 'wx' });
  return `Saved attachment ${attachmentId} (${content.length} bytes, ${metadata.mime}) to ${filepath}`;
}
export async function attachmentsCreate(client: TrilliumClient, args: unknown): Promise<string> {
  const { content, ...metadata } = AttachmentsCreateSchema.parse(args);
  const value = await client.createAttachment({ ...metadata, content: Buffer.from(content, 'base64') });
  return `Created attachment ${value.attachmentId}: ${value.title}; bytes=${value.contentLength ?? Buffer.from(content, 'base64').length}; owner=${value.ownerId}.`;
}
export async function attachmentsUpdate(client: TrilliumClient, args: unknown): Promise<string> {
  const { attachmentId, ...updates } = AttachmentsUpdateSchema.parse(args);
  const value = await client.updateAttachment(attachmentId, updates);
  return `Updated attachment ${value.attachmentId}: ${value.title}; MIME=${value.mime}; role=${value.role}; position=${value.position}.`;
}
export async function attachmentsDelete(client: TrilliumClient, args: unknown): Promise<string> {
  const { attachmentId } = AttachmentsDeleteSchema.parse(args);
  await client.deleteAttachment(attachmentId);
  return `Deleted attachment ${attachmentId}.`;
}
export async function attachmentsUpdateContent(client: TrilliumClient, args: unknown): Promise<string> {
  const { attachmentId, content, mime } = AttachmentsUpdateContentSchema.parse(args);
  const metadata = mime ? undefined : await client.getAttachment(attachmentId);
  const bytes = Buffer.from(content, 'base64');
  await client.updateAttachmentContent(attachmentId, bytes, mime ?? metadata?.mime);
  return `Updated attachment ${attachmentId} content (${bytes.length} bytes).`;
}

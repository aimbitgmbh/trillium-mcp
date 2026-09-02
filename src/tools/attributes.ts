import { z } from 'zod';
import type { TrilliumClient } from '../client.js';
import { EntityIdSchema, NonEmptyUpdate, PositionSchema } from './schemas.js';

export const AttributesGetSchema = z.object({ attributeId: EntityIdSchema.describe('Attribute ID') });
export const AttributesCreateSchema = z.object({
  noteId: EntityIdSchema.describe('Owner note ID'),
  type: z.enum(['label', 'relation']).describe('Attribute type'),
  name: z.string().min(1).max(255).describe('Name without # or ~ prefix'),
  value: z.string().max(10_000).describe('Value; for relations, the target note ID'),
  position: PositionSchema.optional().describe('Order among attributes'),
  isInheritable: z.boolean().optional().describe('Whether child notes inherit it'),
});
export const AttributesUpdateSchema = NonEmptyUpdate({
  attributeId: EntityIdSchema.describe('Attribute ID'),
  value: z.string().max(10_000).optional().describe('New label value; relation values cannot be patched'),
  position: PositionSchema.optional(),
}, 'attributeId');
export const AttributesDeleteSchema = z.object({ attributeId: EntityIdSchema.describe('Attribute ID') });

export async function attributesGet(client: TrilliumClient, args: unknown): Promise<string> {
  const { attributeId } = AttributesGetSchema.parse(args);
  const value = await client.getAttribute(attributeId);
  return `Attribute ${value.attributeId}: ${value.type} ${value.name}=${value.value}; note=${value.noteId}; position=${value.position}; inheritable=${value.isInheritable}`;
}

export async function attributesCreate(client: TrilliumClient, args: unknown): Promise<string> {
  const params = AttributesCreateSchema.parse(args);
  const value = await client.createAttribute(params);
  return `Created attribute ${value.attributeId}: ${value.type} ${value.name}=${value.value} on note ${value.noteId}.`;
}

export async function attributesUpdate(client: TrilliumClient, args: unknown): Promise<string> {
  const { attributeId, ...updates } = AttributesUpdateSchema.parse(args);
  const value = await client.updateAttribute(attributeId, updates);
  return `Updated attribute ${value.attributeId}: ${value.type} ${value.name}=${value.value}; position=${value.position}.`;
}

export async function attributesDelete(client: TrilliumClient, args: unknown): Promise<string> {
  const { attributeId } = AttributesDeleteSchema.parse(args);
  await client.deleteAttribute(attributeId);
  return `Deleted attribute ${attributeId}.`;
}

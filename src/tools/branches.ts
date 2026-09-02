import { z } from 'zod';
import type { TrilliumClient } from '../client.js';
import { EntityIdSchema, NonEmptyUpdate, PositionSchema } from './schemas.js';

export const BranchesGetSchema = z.object({ branchId: EntityIdSchema.describe('Branch ID') });
export const BranchesCreateSchema = z.object({
  noteId: EntityIdSchema.describe('Note to place in another tree location'),
  parentNoteId: EntityIdSchema.describe('New parent note ID'),
  prefix: z.string().max(255).optional(),
  notePosition: PositionSchema.optional(),
  isExpanded: z.boolean().optional(),
});
export const BranchesUpdateSchema = NonEmptyUpdate({
  branchId: EntityIdSchema.describe('Branch ID'), prefix: z.string().max(255).optional(),
  notePosition: PositionSchema.optional(),
}, 'branchId');
export const BranchesDeleteSchema = z.object({ branchId: EntityIdSchema.describe('Branch ID') });

export async function branchesGet(client: TrilliumClient, args: unknown): Promise<string> {
  const { branchId } = BranchesGetSchema.parse(args);
  const value = await client.getBranch(branchId);
  return `Branch ${value.branchId}: note=${value.noteId}; parent=${value.parentNoteId}; position=${value.notePosition}; prefix=${JSON.stringify(value.prefix ?? '')}; expanded=${value.isExpanded}`;
}
export async function branchesCreate(client: TrilliumClient, args: unknown): Promise<string> {
  const value = await client.createBranch(BranchesCreateSchema.parse(args));
  return `Created branch ${value.branchId}: note ${value.noteId} now also appears under ${value.parentNoteId}.`;
}
export async function branchesUpdate(client: TrilliumClient, args: unknown): Promise<string> {
  const { branchId, ...updates } = BranchesUpdateSchema.parse(args);
  const value = await client.updateBranch(branchId, updates);
  return `Updated branch ${value.branchId}: position=${value.notePosition}; prefix=${JSON.stringify(value.prefix ?? '')}.`;
}
export async function branchesDelete(client: TrilliumClient, args: unknown): Promise<string> {
  const { branchId } = BranchesDeleteSchema.parse(args);
  await client.deleteBranch(branchId);
  return `Deleted branch ${branchId}. If it was the note's last strong branch, Trilium soft-deleted that note and its subtree.`;
}

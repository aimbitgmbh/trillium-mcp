import type { Config } from '../config.js';
import { hasReadPermission, hasWritePermission } from '../config.js';
import type { TrilliumClient } from '../client.js';
import type { z } from 'zod';
import {
  NotesSearchSchema, NoteGetSchema, NoteCreateSchema, NoteOverwriteSchema, NoteDeleteSchema,
  NoteCreateRevisionSchema, NoteReorderSchema, NoteListChildrenSchema, NoteReorderChildrenSchema,
  NoteEditSchema, NotePrependSchema, NoteAppendSchema, NoteGrepSchema, NoteGetLinesSchema,
  NotesHistorySchema, NoteListRevisionsSchema, RevisionGetSchema, NoteListAttachmentsSchema, NoteUndeleteSchema,
  notesSearch, noteGet, noteCreate, noteOverwrite, noteDelete, noteCreateRevision, noteReorder,
  noteListChildren, noteReorderChildren, noteEdit, notePrepend, noteAppend, noteGrep, noteGetLines,
  notesHistory, noteListRevisions, revisionGet, noteListAttachments, noteUndelete,
} from './notes.js';
import {
  AttributesGetSchema, AttributesCreateSchema, AttributesUpdateSchema, AttributesDeleteSchema,
  attributesGet, attributesCreate, attributesUpdate, attributesDelete,
} from './attributes.js';
import {
  BranchesGetSchema, BranchesCreateSchema, BranchesUpdateSchema, BranchesDeleteSchema,
  branchesGet, branchesCreate, branchesUpdate, branchesDelete,
} from './branches.js';
import {
  AttachmentsGetSchema, AttachmentsGetContentSchema, AttachmentsCreateSchema, AttachmentsUpdateSchema,
  AttachmentsDeleteSchema, AttachmentsUpdateContentSchema, attachmentsGet, attachmentsGetContent,
  attachmentsCreate, attachmentsUpdate, attachmentsDelete, attachmentsUpdateContent,
} from './attachments.js';
import {
  CalendarGetDaySchema, CalendarGetWeekSchema, CalendarGetMonthSchema, CalendarGetYearSchema,
  calendarGetDay, calendarGetWeek, calendarGetMonth, calendarGetYear,
} from './calendar.js';
import { InboxGetSchema, inboxGet } from './inbox.js';
import { jsonSchema } from './schemas.js';

type Permission = 'read' | 'write';
type Handler = (client: TrilliumClient, args: unknown) => Promise<string>;
export interface ToolEntry {
  name: string; description: string; permission: Permission; schema: z.ZodType; handler: Handler;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

const read = (name: string, title: string, description: string, schema: z.ZodType, handler: Handler, readOnlyHint = true): ToolEntry => ({
  name, description, schema, handler, permission: 'read',
  annotations: { title, readOnlyHint, destructiveHint: false, idempotentHint: true, openWorldHint: false },
});
const write = (name: string, title: string, description: string, schema: z.ZodType, handler: Handler, destructiveHint = false, idempotentHint = false): ToolEntry => ({
  name, description, schema, handler, permission: 'write',
  annotations: { title, readOnlyHint: false, destructiveHint, idempotentHint, openWorldHint: false },
});

export const toolRegistry: readonly ToolEntry[] = [
  read('notes_search', 'Search notes', 'Search Trilium notes. Use returned note IDs with note_get and other tools.', NotesSearchSchema, notesSearch),
  read('note_get', 'Get note', 'Get note metadata and, by default, Markdown-friendly content. Child and branch IDs are included without extra requests.', NoteGetSchema, noteGet),
  read('note_list_children', 'List children', 'List direct child notes and branch IDs in a chosen order.', NoteListChildrenSchema, noteListChildren),
  read('note_grep', 'Search within note', 'Find case-insensitive text occurrences with line context. HTML notes are searched as Markdown.', NoteGrepSchema, noteGrep),
  read('note_get_lines', 'Read note lines', 'Read an inclusive line range. Positive lines count from 1; negative lines count backward, e.g. -10 to -1.', NoteGetLinesSchema, noteGetLines),
  read('notes_history', 'Recent note history', 'List recent changes below an ancestor. Set deletedOnly to find restorable note IDs.', NotesHistorySchema, notesHistory),
  read('note_list_revisions', 'List revisions', 'List snapshots for a note and return revision IDs.', NoteListRevisionsSchema, noteListRevisions),
  read('revision_get', 'Get revision', 'Get revision metadata and optional content. Binary content is saved to the configured export directory.', RevisionGetSchema, revisionGet),
  read('note_list_attachments', 'List note attachments', 'List attachment metadata and IDs owned by a note.', NoteListAttachmentsSchema, noteListAttachments),
  write('note_create', 'Create note', 'Create a child note. Markdown input is converted to HTML for text/html notes.', NoteCreateSchema, noteCreate),
  write('note_overwrite', 'Overwrite note', 'Replace a note title and/or full content. Omitted fields remain unchanged.', NoteOverwriteSchema, noteOverwrite, true, true),
  write('note_delete', 'Delete note', 'Soft-delete a note and all descendants. It can be restored with note_undelete.', NoteDeleteSchema, noteDelete, true, true),
  write('note_undelete', 'Restore note', 'Restore a soft-deleted note by ID.', NoteUndeleteSchema, noteUndelete, false, true),
  write('note_create_revision', 'Create revision', 'Create a snapshot of the current note state, optionally with a description.', NoteCreateRevisionSchema, noteCreateRevision),
  write('note_reorder', 'Move child', 'Move a note within one parent: first, last, numeric position, before:<noteId>, or after:<noteId>.', NoteReorderSchema, noteReorder, false, true),
  write('note_reorder_children', 'Sort children', 'Persistently sort all direct children by title, creation time, or modification time.', NoteReorderChildrenSchema, noteReorderChildren, false, true),
  write('note_edit', 'Edit note text', 'Replace exact or whitespace-equivalent text. HTML notes accept Markdown text. Ambiguous matches require replace_all.', NoteEditSchema, noteEdit, true, true),
  write('note_prepend', 'Prepend note', 'Add content to the beginning; Markdown is converted for HTML notes.', NotePrependSchema, notePrepend),
  write('note_append', 'Append note', 'Add content to the end; Markdown is converted for HTML notes.', NoteAppendSchema, noteAppend),
  read('branches_get', 'Get branch', 'Inspect one tree placement by branch ID.', BranchesGetSchema, branchesGet),
  write('branches_create', 'Create branch', 'Place an existing note under an additional parent; this links rather than copies it.', BranchesCreateSchema, branchesCreate),
  write('branches_update', 'Update branch', 'Update prefix and/or sibling position for one placement.', BranchesUpdateSchema, branchesUpdate, false, true),
  write('branches_delete', 'Delete branch', "Remove one placement. If it is the last strong branch, Trilium soft-deletes the note's subtree.", BranchesDeleteSchema, branchesDelete, true, true),
  read('attributes_get', 'Get attribute', 'Inspect a label or relation by attribute ID.', AttributesGetSchema, attributesGet),
  write('attributes_create', 'Create attribute', 'Add a label or relation, with optional position and inheritance.', AttributesCreateSchema, attributesCreate),
  write('attributes_update', 'Update attribute', 'Update a label value and/or attribute position. Relation targets and inheritance require delete-and-create.', AttributesUpdateSchema, attributesUpdate, false, true),
  write('attributes_delete', 'Delete attribute', 'Delete one label or relation.', AttributesDeleteSchema, attributesDelete, true, true),
  read('attachments_get', 'Get attachment', 'Get attachment metadata without downloading content.', AttachmentsGetSchema, attachmentsGet),
  read('attachments_get_content', 'Download attachment', 'Download exact attachment bytes to the safe local export directory.', AttachmentsGetContentSchema, attachmentsGetContent, false),
  write('attachments_create', 'Create attachment', 'Create an attachment from canonical base64 file bytes.', AttachmentsCreateSchema, attachmentsCreate),
  write('attachments_update', 'Update attachment', 'Update attachment metadata without changing file bytes.', AttachmentsUpdateSchema, attachmentsUpdate, false, true),
  write('attachments_delete', 'Delete attachment', 'Delete attachment metadata and content.', AttachmentsDeleteSchema, attachmentsDelete, true, true),
  write('attachments_update_content', 'Replace attachment content', 'Replace attachment bytes using canonical base64.', AttachmentsUpdateContentSchema, attachmentsUpdateContent, true, true),
  write('calendar_get_day', 'Get day note', 'Get or create a calendar day note for YYYY-MM-DD.', CalendarGetDaySchema, calendarGetDay),
  write('calendar_get_week', 'Get week note', 'Get or create an ISO week note for YYYY-Www. Requires enableWeekNote in Trilium.', CalendarGetWeekSchema, calendarGetWeek),
  write('calendar_get_month', 'Get month note', 'Get or create a calendar month note for YYYY-MM.', CalendarGetMonthSchema, calendarGetMonth),
  write('calendar_get_year', 'Get year note', 'Get or create a calendar year note for YYYY.', CalendarGetYearSchema, calendarGetYear),
  write('inbox_get', 'Get inbox', 'Get the configured inbox for a date; this may create a day note.', InboxGetSchema, inboxGet),
] as const;

export function getToolEntries(config: Config): ToolEntry[] {
  return toolRegistry.filter((entry) => entry.permission === 'read' ? hasReadPermission(config) : hasWritePermission(config));
}
export function getToolDefinitions(config: Config) {
  return getToolEntries(config).map(({ name, description, schema, annotations }) => ({ name, description, inputSchema: jsonSchema(schema), annotations }));
}
export async function callTool(client: TrilliumClient, config: Config, name: string, args: unknown): Promise<string> {
  const entry = getToolEntries(config).find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Unknown or unauthorized tool: ${name}`);
  return entry.handler(client, args);
}

export * from './notes.js';
export * from './attributes.js';
export * from './branches.js';
export * from './attachments.js';
export * from './calendar.js';
export * from './inbox.js';

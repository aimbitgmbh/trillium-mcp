import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { TrilliumClient } from '../client.js';
import type { Branch, Note } from '../types.js';
import { convertHTMLToMarkdown, detectContentFormat, extensionFor, formatContentForMime, generateFilename, getExportsDirectory, hybridMatch, extractLines, searchInContent, smartReplace } from './helpers.js';
import { EntityIdSchema, NonEmptyUpdate, PositionSchema } from './schemas.js';

const NoteTypeSchema = z.enum(['text', 'code', 'book', 'render']);
const SortSchema = z.enum(['position', 'title', 'created', 'modified']);

export const NotesSearchSchema = z.object({
  query: z.string().min(1).max(2_000).describe('Trilium full-text or advanced search query'),
  fastSearch: z.boolean().optional(), includeArchived: z.boolean().optional(), limit: z.int().min(1).max(100).default(20),
});
export const NoteGetSchema = z.object({ noteId: EntityIdSchema.describe('Note ID'), includeContent: z.boolean().default(true) });
export const NoteCreateSchema = z.object({
  parentNoteId: EntityIdSchema, title: z.string().min(1).max(1_000), content: z.string().max(10_000_000),
  type: NoteTypeSchema.default('text'), mime: z.string().min(1).max(255).optional(),
  notePosition: PositionSchema.optional(), prefix: z.string().max(255).optional(), isExpanded: z.boolean().optional(),
});
export const NoteOverwriteSchema = NonEmptyUpdate({
  noteId: EntityIdSchema, title: z.string().min(1).max(1_000).optional(), content: z.string().max(10_000_000).optional(),
}, 'noteId');
export const NoteDeleteSchema = z.object({ noteId: EntityIdSchema.describe('Note ID to soft-delete with its descendants') });
export const NoteUndeleteSchema = z.object({ noteId: EntityIdSchema.describe('Deleted note ID to restore') });
export const NoteCreateRevisionSchema = z.object({ noteId: EntityIdSchema, description: z.string().max(1_000).optional() });
export const NoteReorderSchema = z.object({
  noteId: EntityIdSchema, parentNoteId: EntityIdSchema,
  position: z.union([z.int().min(1), z.enum(['first', 'last']), z.string().regex(/^(before|after):[A-Za-z0-9_]{4,32}$/)]),
});
export const NoteListChildrenSchema = z.object({ noteId: EntityIdSchema, sortBy: SortSchema.default('position') });
export const NoteReorderChildrenSchema = z.object({ parentNoteId: EntityIdSchema, sortBy: z.enum(['title', 'created', 'modified']) });
export const NoteEditSchema = z.object({
  noteId: EntityIdSchema, old_string: z.string().min(1).max(2_000_000), new_string: z.string().max(2_000_000), replace_all: z.boolean().default(false),
});
export const NotePrependSchema = z.object({ noteId: EntityIdSchema, content: z.string().min(1).max(10_000_000) });
export const NoteAppendSchema = NotePrependSchema;
export const NoteGrepSchema = z.object({ noteId: EntityIdSchema, pattern: z.string().min(1).max(1_000), context_lines: z.int().min(0).max(20).default(2) });
export const NoteGetLinesSchema = z.object({
  noteId: EntityIdSchema,
  start_line: z.int().refine((v) => v !== 0, 'Line cannot be zero').describe('1-based line; negative counts from the end'),
  end_line: z.int().refine((v) => v !== 0, 'Line cannot be zero').describe('Inclusive; negative counts from the end'),
});
export const NotesHistorySchema = z.object({
  ancestorNoteId: EntityIdSchema.default('root'), limit: z.int().min(1).max(500).default(50), deletedOnly: z.boolean().default(false),
});
export const NoteListRevisionsSchema = z.object({ noteId: EntityIdSchema, limit: z.int().min(1).max(100).default(20) });
export const RevisionGetSchema = z.object({ revisionId: EntityIdSchema, includeContent: z.boolean().default(true) });
export const NoteListAttachmentsSchema = z.object({ noteId: EntityIdSchema });

function displayContent(note: Pick<Note, 'mime'>, content: string): string {
  return detectContentFormat(note.mime || 'text/html') === 'html' ? convertHTMLToMarkdown(content) : content;
}
function clipped(content: string, limit = 50_000): string {
  return content.length <= limit ? content : `${content.slice(0, limit)}\n\n[Truncated at ${limit} characters; use note_get_lines for targeted reading.]`;
}
function noteSummary(note: Note): string {
  return `${note.title} [${note.noteId}] type=${note.type} MIME=${note.mime} modified=${note.dateModified}`;
}

export async function notesSearch(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NotesSearchSchema.parse(args);
  const response = await client.searchNotes({ search: params.query, fastSearch: params.fastSearch, includeArchivedNotes: params.includeArchived, limit: params.limit });
  if (!response.results.length) return `No notes found for ${JSON.stringify(params.query)}.`;
  return `${response.results.length} note(s):\n${response.results.map(noteSummary).join('\n')}`;
}

export async function noteGet(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NoteGetSchema.parse(args);
  const note = await client.getNote(params.noteId);
  const lines = [noteSummary(note), `protected=${note.isProtected}`, `parents=${(note.parentNoteIds || []).join(',') || '-'}`, `parentBranches=${(note.parentBranchIds || []).join(',') || '-'}`, `children=${(note.childNoteIds || []).join(',') || '-'}`, `childBranches=${(note.childBranchIds || []).join(',') || '-'}`];
  if (note.attributes?.length) lines.push(`attributes=${note.attributes.map((a) => `${a.attributeId}:${a.type}:${a.name}=${a.value}`).join('; ')}`);
  if (params.includeContent) lines.push('', clipped(displayContent(note, await client.getNoteContent(note.noteId))));
  return lines.join('\n');
}

export async function noteCreate(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NoteCreateSchema.parse(args);
  const mime = params.mime || (params.type === 'text' ? 'text/html' : 'text/plain');
  const value = await client.createNote({ ...params, mime, content: formatContentForMime(params.content, mime) });
  return `Created note ${value.note.noteId} (${JSON.stringify(value.note.title)}) under ${params.parentNoteId}; branch=${value.branch.branchId}.`;
}

export async function noteOverwrite(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId, title, content } = NoteOverwriteSchema.parse(args);
  let note = await client.getNote(noteId);
  if (title !== undefined) note = await client.updateNote(noteId, { title });
  if (content !== undefined) await client.updateNoteContent(noteId, formatContentForMime(content, note.mime || 'text/html'));
  return `Updated note ${noteId}${title !== undefined ? ` title=${JSON.stringify(title)}` : ''}${content !== undefined ? ` content=${content.length} input characters` : ''}.`;
}

export async function noteDelete(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId } = NoteDeleteSchema.parse(args);
  const note = await client.getNote(noteId);
  await client.deleteNote(noteId);
  return `Soft-deleted note ${noteId} (${JSON.stringify(note.title)}) and its descendants. Use note_undelete to restore it.`;
}
export async function noteUndelete(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId } = NoteUndeleteSchema.parse(args);
  await client.undeleteNote(noteId);
  return `Restored note ${noteId}.`;
}
export async function noteCreateRevision(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId, description } = NoteCreateRevisionSchema.parse(args);
  await client.createNoteRevision(noteId, description);
  return `Created a revision for note ${noteId}${description ? ` (${JSON.stringify(description)})` : ''}.`;
}

async function children(client: TrilliumClient, parentId: string): Promise<Array<{ branch: Branch; note: Note }>> {
  const parent = await client.getNote(parentId);
  const branches = await Promise.all((parent.childBranchIds || []).map((id) => client.getBranch(id)));
  const notes = await Promise.all(branches.map((branch) => client.getNote(branch.noteId)));
  return branches.map((branch, index) => ({ branch, note: notes[index] }));
}
function sortChildren(values: Awaited<ReturnType<typeof children>>, sortBy: z.infer<typeof SortSchema>) {
  return values.sort((a, b) => sortBy === 'position' ? a.branch.notePosition - b.branch.notePosition
    : sortBy === 'title' ? a.note.title.localeCompare(b.note.title)
      : sortBy === 'created' ? a.note.dateCreated.localeCompare(b.note.dateCreated)
        : a.note.dateModified.localeCompare(b.note.dateModified));
}
export async function noteListChildren(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId, sortBy } = NoteListChildrenSchema.parse(args);
  const values = sortChildren(await children(client, noteId), sortBy);
  if (!values.length) return `Note ${noteId} has no children.`;
  return `${values.length} child note(s) of ${noteId}, sorted by ${sortBy}:\n${values.map(({ branch, note }, i) => `${i + 1}. ${note.title} [${note.noteId}] branch=${branch.branchId} position=${branch.notePosition}`).join('\n')}`;
}
export async function noteReorderChildren(client: TrilliumClient, args: unknown): Promise<string> {
  const { parentNoteId, sortBy } = NoteReorderChildrenSchema.parse(args);
  const values = sortChildren(await children(client, parentNoteId), sortBy);
  await Promise.all(values.map(({ branch }, index) => client.updateBranch(branch.branchId, { notePosition: (index + 1) * 10 })));
  await client.refreshNoteOrdering(parentNoteId);
  return `Reordered ${values.length} children of ${parentNoteId} by ${sortBy}.`;
}
export async function noteReorder(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId, parentNoteId, position } = NoteReorderSchema.parse(args);
  const values = sortChildren(await children(client, parentNoteId), 'position').filter(({ note }) => note.noteId !== noteId);
  const target = await client.getNote(noteId);
  const branchId = await (async () => {
    for (const id of target.parentBranchIds || []) if ((await client.getBranch(id)).parentNoteId === parentNoteId) return id;
    return undefined;
  })();
  if (!branchId) throw new Error(`Note ${noteId} is not a child of ${parentNoteId}`);
  let index: number;
  if (position === 'first') index = 0;
  else if (position === 'last') index = values.length;
  else if (typeof position === 'number') index = Math.min(values.length, position - 1);
  else {
    const [direction, siblingId] = position.split(':');
    const siblingIndex = values.findIndex(({ note }) => note.noteId === siblingId);
    if (siblingIndex < 0) throw new Error(`Sibling ${siblingId} is not under ${parentNoteId}`);
    index = siblingIndex + (direction === 'after' ? 1 : 0);
  }
  const ordered = [...values];
  ordered.splice(index, 0, { branch: await client.getBranch(branchId), note: target });
  await Promise.all(ordered.map(({ branch }, i) => client.updateBranch(branch.branchId, { notePosition: (i + 1) * 10 })));
  await client.refreshNoteOrdering(parentNoteId);
  return `Moved note ${noteId} to child position ${index + 1} under ${parentNoteId}.`;
}

export async function noteEdit(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NoteEditSchema.parse(args);
  const note = await client.getNote(params.noteId);
  const before = await client.getNoteContent(params.noteId);
  const match = detectContentFormat(note.mime) === 'html'
    ? hybridMatch(before, params.old_string, params.new_string, params.replace_all)
    : (() => { const result = smartReplace(before, params.old_string, params.new_string, params.replace_all); return result.result === undefined ? { success: false, error: result.strategy === 'ambiguous' ? `old_string occurs ${result.count} times; set replace_all=true or provide more context` : 'old_string was not found' } : { success: true, result: result.result, strategy: result.strategy }; })();
  if (!match.success || match.result === undefined) throw new Error(match.error);
  if (match.result === before) throw new Error('Edit produced no content change');
  await client.updateNoteContent(params.noteId, match.result);
  return `Edited note ${params.noteId} using ${match.strategy}; size ${before.length} -> ${match.result.length}.`;
}
async function addContent(client: TrilliumClient, args: unknown, prepend: boolean): Promise<string> {
  const params = NotePrependSchema.parse(args);
  const note = await client.getNote(params.noteId);
  const before = await client.getNoteContent(params.noteId);
  const added = formatContentForMime(params.content, note.mime || 'text/html');
  const after = prepend ? `${added}\n\n${before}` : `${before}\n\n${added}`;
  await client.updateNoteContent(params.noteId, after);
  return `${prepend ? 'Prepended' : 'Appended'} ${added.length} characters to note ${params.noteId}; new size=${after.length}.`;
}
export function notePrepend(client: TrilliumClient, args: unknown): Promise<string> { return addContent(client, args, true); }
export function noteAppend(client: TrilliumClient, args: unknown): Promise<string> { return addContent(client, args, false); }

export async function noteGrep(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NoteGrepSchema.parse(args);
  const note = await client.getNote(params.noteId);
  const content = displayContent(note, await client.getNoteContent(params.noteId));
  const matches = searchInContent(content, params.pattern, params.context_lines);
  if (!matches.length) return `No matches for ${JSON.stringify(params.pattern)} in note ${params.noteId}.`;
  return `${matches.length} matching line(s):\n${matches.map((match) => `line ${match.lineNumber}:\n${match.context.join('\n')}`).join('\n---\n')}`;
}
export async function noteGetLines(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NoteGetLinesSchema.parse(args);
  const note = await client.getNote(params.noteId);
  const content = displayContent(note, await client.getNoteContent(params.noteId));
  const value = extractLines(content, params.start_line, params.end_line);
  return `Lines ${value.actualStart}-${value.actualEnd} of ${value.totalLines} in ${note.title} [${note.noteId}]:\n${value.lines}`;
}

export async function notesHistory(client: TrilliumClient, args: unknown): Promise<string> {
  const params = NotesHistorySchema.parse(args);
  let values = await client.getNoteHistory({ ancestorNoteId: params.ancestorNoteId, limit: params.limit });
  if (params.deletedOnly) {
    const seen = new Set<string>();
    values = values.filter((value) => Boolean(value.current_isDeleted) && !seen.has(value.noteId) && seen.add(value.noteId));
  }
  if (!values.length) return 'No matching history entries.';
  return `${values.length} history entry/entries:\n${values.map((value) => `${value.utcDate} ${value.current_isDeleted ? 'DELETED' : 'changed'} ${value.title} [${value.noteId}]${value.canBeUndeleted ? ' restorable' : ''}`).join('\n')}`;
}
export async function noteListRevisions(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId, limit } = NoteListRevisionsSchema.parse(args);
  const values = (await client.listNoteRevisions(noteId)).slice(0, limit);
  if (!values.length) return `No revisions for note ${noteId}.`;
  return `${values.length} revision(s) for ${noteId}:\n${values.map((value) => `${value.utcDateLastEdited || value.utcDateCreated} ${value.title} [${value.revisionId}] MIME=${value.mime} bytes=${value.contentLength ?? 'unknown'}`).join('\n')}`;
}
export async function revisionGet(client: TrilliumClient, args: unknown): Promise<string> {
  const { revisionId, includeContent } = RevisionGetSchema.parse(args);
  const value = await client.getRevision(revisionId);
  const header = `Revision ${revisionId} of note ${value.noteId}: ${value.title}; MIME=${value.mime}; edited=${value.utcDateLastEdited || value.utcDateCreated}`;
  if (!includeContent) return header;
  const textual = value.mime.startsWith('text/') || value.mime.includes('json') || value.mime.includes('xml') || value.type === 'text' || value.type === 'code';
  const content = await client.getRevisionContent(revisionId, !textual);
  if (typeof content === 'string') return `${header}\n\n${clipped(displayContent({ mime: value.mime } as Note, content))}`;
  const directory = await getExportsDirectory();
  const filepath = path.resolve(directory, generateFilename('revision', revisionId, extensionFor(value.title, value.mime)));
  if (path.dirname(filepath) !== directory) throw new Error('Refusing unsafe export path');
  await fs.writeFile(filepath, content, { flag: 'wx' });
  return `${header}\nSaved ${content.length} binary bytes to ${filepath}`;
}
export async function noteListAttachments(client: TrilliumClient, args: unknown): Promise<string> {
  const { noteId } = NoteListAttachmentsSchema.parse(args);
  const values = await client.listNoteAttachments(noteId);
  if (!values.length) return `No attachments owned by note ${noteId}.`;
  return `${values.length} attachment(s) on ${noteId}:\n${values.map((value) => `${value.title} [${value.attachmentId}] MIME=${value.mime} role=${value.role} bytes=${value.contentLength ?? 'unknown'}`).join('\n')}`;
}

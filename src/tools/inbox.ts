import { z } from 'zod';
import type { TrilliumClient } from '../client.js';
import { DateSchema } from './schemas.js';

export const InboxGetSchema = z.object({ date: DateSchema.describe('Date, YYYY-MM-DD') });
export async function inboxGet(client: TrilliumClient, args: unknown): Promise<string> {
  const { date } = InboxGetSchema.parse(args);
  const note = await client.getInboxNote(date);
  return `Inbox for ${date}: ${note.title} [noteId=${note.noteId}]. This endpoint may create a day note when no fixed inbox is configured.`;
}

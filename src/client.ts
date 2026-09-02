import { Agent, fetch, type Dispatcher } from 'undici';
import type { Config } from './config.js';
import type { AppInfo, Attachment, Attribute, Branch, CreateNoteDef, Note, NoteWithBranch, RecentChange, Revision, SearchResponse } from './types.js';

type ResponseMode = 'json' | 'text' | 'binary' | 'void';
type RequestBody = string | Buffer | Record<string, unknown>;

export class TrilliumApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Trillium ETAPI error (${status}): ${message}`);
    this.name = 'TrilliumApiError';
  }
}

export class TrilliumClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly maxAttachmentBytes: number;
  private readonly dispatcher: Dispatcher;

  constructor(config: Config, dispatcher?: Dispatcher) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken;
    this.timeoutMs = config.requestTimeoutMs;
    this.maxAttachmentBytes = config.maxAttachmentBytes;
    this.dispatcher = dispatcher ?? new Agent({
      connect: { rejectUnauthorized: config.verifySsl },
      pipelining: 0,
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
    });
  }

  async close(): Promise<void> {
    if ('close' in this.dispatcher && typeof this.dispatcher.close === 'function') await this.dispatcher.close();
  }

  private id(value: string): string { return encodeURIComponent(value); }
  private isRetryableTransportError(error: unknown): boolean {
    const candidate = error as { code?: string; cause?: { code?: string } };
    const code = candidate?.cause?.code ?? candidate?.code;
    return ['UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(code ?? '');
  }

  private async request<T>(method: string, path: string, body?: RequestBody, mode: ResponseMode = 'json', contentType?: string): Promise<T> {
    const attempts = method === 'GET' ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const headers: Record<string, string> = { Authorization: `Bearer ${this.apiToken}` };
        let requestBody: string | Buffer | undefined;
        if (body !== undefined) {
          if (Buffer.isBuffer(body)) {
            requestBody = body;
            headers['Content-Type'] = contentType ?? 'application/octet-stream';
          } else if (typeof body === 'string') {
            requestBody = body;
            headers['Content-Type'] = contentType ?? 'text/plain; charset=utf-8';
          } else {
            requestBody = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
          }
        }
        const response = await fetch(`${this.apiUrl}${path}`, {
          method, headers, body: requestBody, dispatcher: this.dispatcher, signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          const errorBody = (await response.text()).slice(0, 4_096);
          throw new TrilliumApiError(response.status, errorBody || response.statusText);
        }
        if (mode === 'void' || response.status === 204) return undefined as T;
        if (mode === 'text') return await response.text() as T;
        if (mode === 'binary') return Buffer.from(await response.arrayBuffer()) as T;
        return await response.json() as T;
      } catch (error) {
        if (attempt < attempts && !(error instanceof TrilliumApiError) && this.isRetryableTransportError(error)) continue;
        throw error;
      }
    }
    throw new Error('Unreachable request state');
  }

  getAppInfo(): Promise<AppInfo> { return this.request('GET', '/app-info'); }
  searchNotes(params: { search: string; fastSearch?: boolean; includeArchivedNotes?: boolean; ancestorNoteId?: string; ancestorDepth?: string; orderBy?: string; orderDirection?: 'asc' | 'desc'; limit?: number; debug?: boolean }): Promise<SearchResponse> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
    return this.request('GET', `/notes?${query}`);
  }
  getNote(id: string): Promise<Note> { return this.request('GET', `/notes/${this.id(id)}`); }
  updateNote(id: string, value: Partial<Note>): Promise<Note> { return this.request('PATCH', `/notes/${this.id(id)}`, value); }
  deleteNote(id: string): Promise<void> { return this.request('DELETE', `/notes/${this.id(id)}`, undefined, 'void'); }
  undeleteNote(id: string): Promise<void> { return this.request('POST', `/notes/${this.id(id)}/undelete`, undefined, 'void'); }
  getNoteContent(id: string): Promise<string> { return this.request('GET', `/notes/${this.id(id)}/content`, undefined, 'text'); }
  updateNoteContent(id: string, content: string): Promise<void> { return this.request('PUT', `/notes/${this.id(id)}/content`, content, 'void'); }
  createNote(value: CreateNoteDef): Promise<NoteWithBranch> { return this.request('POST', '/create-note', value as unknown as Record<string, unknown>); }
  getNoteHistory(params: { ancestorNoteId?: string; limit?: number }): Promise<RecentChange[]> {
    const query = new URLSearchParams();
    if (params.ancestorNoteId) query.set('ancestorNoteId', params.ancestorNoteId);
    if (params.limit) query.set('limit', String(params.limit));
    return this.request('GET', `/notes/history?${query}`);
  }
  listNoteRevisions(id: string): Promise<Revision[]> { return this.request('GET', `/notes/${this.id(id)}/revisions`); }
  createNoteRevision(id: string, description?: string): Promise<void> { return this.request('POST', `/notes/${this.id(id)}/revision`, description === undefined ? undefined : { description }, 'void'); }
  getRevision(id: string): Promise<Revision> { return this.request('GET', `/revisions/${this.id(id)}`); }
  getRevisionContent(id: string, binary = false): Promise<string | Buffer> { return this.request('GET', `/revisions/${this.id(id)}/content`, undefined, binary ? 'binary' : 'text'); }

  createBranch(value: { noteId: string; parentNoteId: string; prefix?: string; notePosition?: number; isExpanded?: boolean }): Promise<Branch> { return this.request('POST', '/branches', value); }
  getBranch(id: string): Promise<Branch> { return this.request('GET', `/branches/${this.id(id)}`); }
  updateBranch(id: string, value: Partial<Branch>): Promise<Branch> { return this.request('PATCH', `/branches/${this.id(id)}`, value); }
  deleteBranch(id: string): Promise<void> { return this.request('DELETE', `/branches/${this.id(id)}`, undefined, 'void'); }
  createAttribute(value: { noteId: string; type: 'label' | 'relation'; name: string; value: string; position?: number; isInheritable?: boolean }): Promise<Attribute> { return this.request('POST', '/attributes', value); }
  getAttribute(id: string): Promise<Attribute> { return this.request('GET', `/attributes/${this.id(id)}`); }
  updateAttribute(id: string, value: Partial<Attribute>): Promise<Attribute> { return this.request('PATCH', `/attributes/${this.id(id)}`, value); }
  deleteAttribute(id: string): Promise<void> { return this.request('DELETE', `/attributes/${this.id(id)}`, undefined, 'void'); }

  listNoteAttachments(id: string): Promise<Attachment[]> { return this.request('GET', `/notes/${this.id(id)}/attachments`); }
  assertAttachmentSize(size?: number): void {
    if (size !== undefined && size > this.maxAttachmentBytes) throw new Error(`Attachment exceeds ${this.maxAttachmentBytes} byte limit`);
  }
  getAttachment(id: string): Promise<Attachment> { return this.request('GET', `/attachments/${this.id(id)}`); }
  getAttachmentContent(id: string): Promise<Buffer> { return this.request('GET', `/attachments/${this.id(id)}/content`, undefined, 'binary'); }
  updateAttachment(id: string, value: Partial<Attachment>): Promise<Attachment> { return this.request('PATCH', `/attachments/${this.id(id)}`, value); }
  deleteAttachment(id: string): Promise<void> { return this.request('DELETE', `/attachments/${this.id(id)}`, undefined, 'void'); }
  updateAttachmentContent(id: string, content: Buffer, mime = 'application/octet-stream'): Promise<void> {
    this.assertAttachmentSize(content.length);
    return this.request('PUT', `/attachments/${this.id(id)}/content`, content, 'void', mime);
  }
  async createAttachment(value: { ownerId: string; role: string; mime: string; title: string; content: Buffer; position?: number }): Promise<Attachment> {
    this.assertAttachmentSize(value.content.length);
    const metadata: Record<string, unknown> = { ownerId: value.ownerId, role: value.role, mime: value.mime, title: value.title };
    if (value.position !== undefined) metadata.position = value.position;
    const created = await this.request<Attachment>('POST', '/attachments', metadata);
    try {
      await this.updateAttachmentContent(created.attachmentId, value.content, value.mime);
      return await this.getAttachment(created.attachmentId);
    } catch (error) {
      try { await this.deleteAttachment(created.attachmentId); } catch { /* keep the upload error */ }
      throw error;
    }
  }

  getDayNote(value: string): Promise<Note> { return this.request('GET', `/calendar/days/${this.id(value)}`); }
  getWeekNote(value: string): Promise<Note> { return this.request('GET', `/calendar/weeks/${this.id(value)}`); }
  getMonthNote(value: string): Promise<Note> { return this.request('GET', `/calendar/months/${this.id(value)}`); }
  getYearNote(value: string): Promise<Note> { return this.request('GET', `/calendar/years/${this.id(value)}`); }
  getInboxNote(value: string): Promise<Note> { return this.request('GET', `/inbox/${this.id(value)}`); }
  refreshNoteOrdering(id: string): Promise<void> { return this.request('POST', `/refresh-note-ordering/${this.id(id)}`, undefined, 'void'); }
}

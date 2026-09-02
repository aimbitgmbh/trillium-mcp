export type EntityId = string;
export type NoteType = 'text' | 'code' | 'render' | 'file' | 'image' | 'search' | 'relationMap' | 'book' | 'noteMap' | 'mermaid' | 'webView' | 'shortcut' | 'doc' | 'contentWidget' | 'launcher';
export type AttributeType = 'label' | 'relation';

export interface Note {
  noteId: EntityId; title: string; type: NoteType; mime: string; isProtected: boolean;
  blobId?: string; attributes?: Attribute[]; parentNoteIds?: EntityId[]; childNoteIds?: EntityId[];
  parentBranchIds?: EntityId[]; childBranchIds?: EntityId[]; dateCreated: string; dateModified: string;
  utcDateCreated: string; utcDateModified: string; [key: string]: unknown;
}

export interface CreateNoteDef {
  parentNoteId: EntityId; title: string; type: NoteType; content: string; mime?: string;
  notePosition?: number; prefix?: string; isExpanded?: boolean; noteId?: EntityId; branchId?: EntityId;
}

export interface NoteWithBranch { note: Note; branch: Branch }
export interface Branch {
  branchId: EntityId; noteId: EntityId; parentNoteId: EntityId; prefix?: string;
  notePosition: number; isExpanded: boolean; utcDateModified: string; [key: string]: unknown;
}
export interface Attribute {
  attributeId: EntityId; noteId: EntityId; type: AttributeType; name: string; value: string;
  position: number; isInheritable: boolean; utcDateModified: string; [key: string]: unknown;
}
export interface Attachment {
  attachmentId: EntityId; ownerId: EntityId; role: string; mime: string; title: string;
  position: number; blobId?: string; utcDateModified: string;
  utcDateScheduledForErasureSince?: string | null; contentLength?: number; [key: string]: unknown;
}
export interface Revision {
  revisionId: EntityId; noteId: EntityId; title: string; type: NoteType; mime: string;
  isProtected: boolean; utcDateLastEdited: string; utcDateCreated: string;
  dateLastEdited?: string; dateCreated?: string; contentLength?: number; content?: string; [key: string]: unknown;
}
export interface RecentChange {
  noteId: EntityId; title: string; current_title: string; current_isDeleted: boolean | number; current_deleteId?: EntityId;
  current_isProtected: boolean | number; utcDate: string; date: string; canBeUndeleted?: boolean; [key: string]: unknown;
}
export interface SearchResponse { results: Note[]; [key: string]: unknown }
export interface AppInfo {
  appVersion: string; dbVersion: number; syncVersion: number; buildDate: string; buildRevision: string;
  dataDirectory: string; clipperProtocolVersion: string; utcDateTime: string; [key: string]: unknown;
}

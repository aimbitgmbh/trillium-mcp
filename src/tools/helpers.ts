import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { marked } from 'marked';
import TurndownService from 'turndown';

export async function getExportsDirectory(): Promise<string> {
  const directory = path.resolve(process.env.TRILLIUM_EXPORTS_DIR || path.join(os.homedir(), 'Downloads', 'trillium-exports'));
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export function sanitizeFilename(value: string): string {
  const cleaned = value.normalize('NFKC').replace(/[\\/\0<>:"|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').trim();
  return (cleaned || 'download').slice(0, 120);
}

export function generateFilename(prefix: string, id: string, extension = ''): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeExtension = /^\.[A-Za-z0-9]{1,10}$/.test(extension) ? extension : '';
  return `${sanitizeFilename(prefix)}-${sanitizeFilename(id)}-${timestamp}${safeExtension}`;
}

export function extensionFor(title: string, mime: string): string {
  const titleExtension = path.extname(sanitizeFilename(title));
  if (/^\.[A-Za-z0-9]{1,10}$/.test(titleExtension)) return titleExtension;
  return ({
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/svg+xml': '.svg',
    'application/pdf': '.pdf', 'text/plain': '.txt', 'text/html': '.html',
    'application/json': '.json', 'application/zip': '.zip',
  } as Record<string, string>)[mime] || '.bin';
}

export function detectContentFormat(mime: string): 'html' | 'markdown' | 'plaintext' {
  const value = mime.toLowerCase();
  if (value.includes('markdown') || value === 'text/x-markdown') return 'markdown';
  if (value === 'text/html') return 'html';
  return 'plaintext';
}

export function convertMarkdownToHTML(content: string): string {
  return (marked.parse(content, { gfm: true, breaks: true }) as string).trim();
}

export function formatContentForMime(content: string, mime: string): string {
  return detectContentFormat(mime) === 'html' ? convertMarkdownToHTML(content) : content;
}

export function convertHTMLToMarkdown(html: string): string {
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  return service.turndown(html).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexiblePattern(value: string): RegExp {
  return new RegExp(value.trim().split(/\s+/).map(escapeRegExp).join('\\s+'));
}

export function smartReplace(content: string, oldValue: string, newValue: string, replaceAll = false): { result?: string; count: number; strategy: string } {
  const exactCount = content.split(oldValue).length - 1;
  if (exactCount > 0) {
    if (!replaceAll && exactCount !== 1) return { count: exactCount, strategy: 'ambiguous' };
    return { result: replaceAll ? content.split(oldValue).join(newValue) : content.replace(oldValue, newValue), count: exactCount, strategy: 'exact' };
  }
  const base = flexiblePattern(oldValue);
  const flags = replaceAll ? 'g' : '';
  const pattern = new RegExp(base.source, flags);
  const matches = [...content.matchAll(new RegExp(base.source, 'g'))];
  if (matches.length === 0) return { count: 0, strategy: 'none' };
  if (!replaceAll && matches.length !== 1) return { count: matches.length, strategy: 'ambiguous' };
  return { result: content.replace(pattern, newValue), count: matches.length, strategy: 'whitespace' };
}

export function hybridMatch(html: string, oldValue: string, newValue: string, replaceAll = false): { success: boolean; result?: string; strategy?: string; error?: string } {
  const direct = smartReplace(html, oldValue, newValue, replaceAll);
  if (direct.result !== undefined) return { success: true, result: direct.result, strategy: `html-${direct.strategy}` };
  if (direct.strategy === 'ambiguous') return { success: false, error: `old_string occurs ${direct.count} times; set replace_all=true or provide more context` };

  const markdown = convertHTMLToMarkdown(html);
  const markdownResult = smartReplace(markdown, oldValue, newValue, replaceAll);
  if (markdownResult.result !== undefined) {
    return { success: true, result: convertMarkdownToHTML(markdownResult.result), strategy: `markdown-${markdownResult.strategy}` };
  }
  if (markdownResult.strategy === 'ambiguous') return { success: false, error: `old_string occurs ${markdownResult.count} times; set replace_all=true or provide more context` };

  const oldHtml = convertMarkdownToHTML(oldValue);
  const newHtml = convertMarkdownToHTML(newValue);
  const converted = smartReplace(html, oldHtml, newHtml, replaceAll);
  if (converted.result !== undefined) return { success: true, result: converted.result, strategy: `converted-${converted.strategy}` };
  return { success: false, error: 'old_string was not found in HTML or its Markdown representation' };
}

export function extractLines(content: string, startLine: number, endLine: number): { lines: string; totalLines: number; actualStart: number; actualEnd: number } {
  const all = content.split('\n');
  const resolve = (line: number) => line < 0 ? all.length + line + 1 : line;
  let start = Math.max(1, Math.min(all.length, resolve(startLine)));
  let end = Math.max(1, Math.min(all.length, resolve(endLine)));
  if (start > end) [start, end] = [end, start];
  return { lines: all.slice(start - 1, end).join('\n'), totalLines: all.length, actualStart: start, actualEnd: end };
}

export function searchInContent(content: string, pattern: string, contextLines = 2): Array<{ lineNumber: number; context: string[]; matchOffset: number }> {
  const lines = content.split('\n');
  const needle = pattern.toLocaleLowerCase();
  return lines.flatMap((line, index) => line.toLocaleLowerCase().includes(needle)
    ? [{ lineNumber: index + 1, context: lines.slice(Math.max(0, index - contextLines), index + contextLines + 1), matchOffset: Math.min(contextLines, index) }]
    : []);
}

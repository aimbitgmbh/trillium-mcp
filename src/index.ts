#!/usr/bin/env node

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, type Config } from './config.js';
import { TrilliumClient } from './client.js';
import { callTool, getToolDefinitions } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

export function createServer(config: Config, client: TrilliumClient): Server {
  const server = new Server({ name: 'trillium-mcp', version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: getToolDefinitions(config) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const text = await callTool(client, config, request.params.name, request.params.arguments);
      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Tool ${request.params.name} failed: ${message}`);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  });
  return server;
}

export async function main(): Promise<void> {
  dotenvConfig({ quiet: true });
  const config = loadConfig();
  const client = new TrilliumClient(config);
  const server = createServer(config, client);

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  try {
    const appInfo = await client.getAppInfo();
    console.error(`trillium-mcp ${version}: connected to Trilium ${appInfo.appVersion}; permissions=${config.permissions}`);
    await server.connect(new StdioServerTransport());
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

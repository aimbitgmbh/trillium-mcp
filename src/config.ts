import { z } from 'zod';

const configSchema = z.object({
  apiUrl: z.url().refine((value) => new URL(value).pathname.replace(/\/+$/, '').endsWith('/etapi'), 'must end with /etapi'),
  apiToken: z.string().min(1),
  permissions: z.enum(['READ', 'READ;WRITE']).default('READ'),
  verifySsl: z.boolean().default(true),
  requestTimeoutMs: z.int().min(100).max(300_000).default(30_000),
  maxAttachmentBytes: z.int().min(1).max(1024 ** 3).default(25 * 1024 ** 2),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const verifySsl = env.TRILLIUM_VERIFY_SSL ?? env.VERIFY_SSL;
  return configSchema.parse({
    apiUrl: env.TRILLIUM_API_URL,
    apiToken: env.TRILLIUM_API_TOKEN,
    permissions: env.TRILLIUM_PERMISSIONS || 'READ',
    verifySsl: verifySsl === undefined ? true : verifySsl.toLowerCase() !== 'false',
    requestTimeoutMs: env.TRILLIUM_REQUEST_TIMEOUT_MS ? Number(env.TRILLIUM_REQUEST_TIMEOUT_MS) : undefined,
    maxAttachmentBytes: env.TRILLIUM_MAX_ATTACHMENT_BYTES ? Number(env.TRILLIUM_MAX_ATTACHMENT_BYTES) : undefined,
  });
}

export function hasReadPermission(config: Config): boolean {
  return config.permissions === 'READ' || config.permissions === 'READ;WRITE';
}

export function hasWritePermission(config: Config): boolean {
  return config.permissions === 'READ;WRITE';
}

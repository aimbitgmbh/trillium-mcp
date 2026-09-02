import { z } from 'zod';

export const EntityIdSchema = z.string().regex(/^[A-Za-z0-9_]{4,32}$/, 'Expected a Trilium entity ID');
export const PositionSchema = z.int().min(-2_147_483_648).max(2_147_483_647);
export const NonEmptyUpdate = <T extends z.ZodRawShape>(shape: T, idKey: keyof T) => z.object(shape).refine(
  (value) => Object.entries(value as Record<string, unknown>).some(([key, field]) => key !== idKey && field !== undefined),
  'Provide at least one field to update',
).meta({ nonEmptyUpdateFields: Object.keys(shape).filter((key) => key !== idKey) });

export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Expected a real date in YYYY-MM-DD format');
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
export const YearSchema = z.string().regex(/^\d{4}$/, 'Expected YYYY');
export const WeekSchema = z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, 'Expected ISO week YYYY-Www');

export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const value = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete value.$schema;
  if (value.type === 'object') value.additionalProperties = false;
  const metadata = schema.meta() as { nonEmptyUpdateFields?: string[] } | undefined;
  if (metadata?.nonEmptyUpdateFields) value.anyOf = metadata.nonEmptyUpdateFields.map((field) => ({ required: [field] }));
  return value;
}

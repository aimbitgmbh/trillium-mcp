import { z } from 'zod';
import type { TrilliumClient } from '../client.js';
import { DateSchema, MonthSchema, WeekSchema, YearSchema } from './schemas.js';

export const CalendarGetDaySchema = z.object({ date: DateSchema.describe('Date, YYYY-MM-DD') });
export const CalendarGetWeekSchema = z.object({ week: WeekSchema.describe('ISO week, YYYY-Www') });
export const CalendarGetMonthSchema = z.object({ month: MonthSchema.describe('Month, YYYY-MM') });
export const CalendarGetYearSchema = z.object({ year: YearSchema.describe('Year, YYYY') });

async function format(getter: () => ReturnType<TrilliumClient['getDayNote']>, value: string): Promise<string> {
  const note = await getter();
  return `Calendar note ${value}: ${note.title} [noteId=${note.noteId}]. The endpoint may have created it.`;
}
export async function calendarGetDay(client: TrilliumClient, args: unknown): Promise<string> {
  const { date } = CalendarGetDaySchema.parse(args); return format(() => client.getDayNote(date), date);
}
export async function calendarGetWeek(client: TrilliumClient, args: unknown): Promise<string> {
  const { week } = CalendarGetWeekSchema.parse(args); return format(() => client.getWeekNote(week), week);
}
export async function calendarGetMonth(client: TrilliumClient, args: unknown): Promise<string> {
  const { month } = CalendarGetMonthSchema.parse(args); return format(() => client.getMonthNote(month), month);
}
export async function calendarGetYear(client: TrilliumClient, args: unknown): Promise<string> {
  const { year } = CalendarGetYearSchema.parse(args); return format(() => client.getYearNote(year), year);
}

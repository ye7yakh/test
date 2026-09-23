// Weekly opening hours. The API speaks "HH:MM" strings, seven days (0 = Sunday),
// each with zero or more ranges; a closing time at or before the opening time
// means the range runs past midnight. Stored as minutes from midnight.
import { HttpError } from './http.js';
import { query, type Db } from './db.js';

export interface Range {
  open: string;
  close: string;
}
export type Week = Range[][];

export interface HoursRow {
  weekday: number;
  open_min: number;
  close_min: number;
}

const MAX_RANGES_PER_DAY = 4;

function toMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function toClock(min: number): string {
  const m = min % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseWeek(v: unknown, field = 'hours'): HoursRow[] {
  if (!Array.isArray(v) || v.length !== 7) throw new HttpError(400, 'invalid', field);
  const byDay: HoursRow[][] = v.map((day, weekday) => {
    if (!Array.isArray(day) || day.length > MAX_RANGES_PER_DAY) throw new HttpError(400, 'invalid', `${field}.${weekday}`);
    const ranges = day.map((r) => {
      const open = toMinutes((r as Range)?.open);
      let close = toMinutes((r as Range)?.close);
      if (open === null || close === null) throw new HttpError(400, 'invalid', `${field}.${weekday}`);
      if (close <= open) close += 1440;
      return { weekday, open_min: open, close_min: close };
    });
    ranges.sort((a, b) => a.open_min - b.open_min);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i]!.open_min < ranges[i - 1]!.close_min) throw new HttpError(400, 'hours_overlap', `${field}.${weekday}`);
    }
    return ranges;
  });
  // A range past midnight must end before the next day's first range starts.
  byDay.forEach((ranges, weekday) => {
    const last = ranges[ranges.length - 1];
    const next = byDay[(weekday + 1) % 7]![0];
    if (last && next && last.close_min - 1440 > next.open_min) {
      throw new HttpError(400, 'hours_overlap', `${field}.${(weekday + 1) % 7}`);
    }
  });
  return byDay.flat();
}

export function formatWeek(rows: HoursRow[]): Week {
  const week: Week = [[], [], [], [], [], [], []];
  for (const r of [...rows].sort((a, b) => a.weekday - b.weekday || a.open_min - b.open_min)) {
    week[r.weekday]!.push({ open: toClock(r.open_min), close: toClock(r.close_min) });
  }
  return week;
}

export async function loadSalonWeek(db: Db, salonId: number): Promise<Week> {
  return formatWeek(await query<HoursRow>('select weekday, open_min, close_min from salon_hours where salon_id = $1', [salonId], db));
}

export async function saveSalonWeek(db: Db, salonId: number, rows: HoursRow[]): Promise<void> {
  await query('delete from salon_hours where salon_id = $1', [salonId], db);
  for (const r of rows) {
    await query('insert into salon_hours (salon_id, weekday, open_min, close_min) values ($1, $2, $3, $4)', [salonId, r.weekday, r.open_min, r.close_min], db);
  }
}

export async function saveStaffWeek(db: Db, salonId: number, staffId: number, rows: HoursRow[]): Promise<void> {
  await query('delete from staff_hours where salon_id = $1 and staff_id = $2', [salonId, staffId], db);
  for (const r of rows) {
    await query(
      'insert into staff_hours (salon_id, staff_id, weekday, open_min, close_min) values ($1, $2, $3, $4, $5)',
      [salonId, staffId, r.weekday, r.open_min, r.close_min],
      db,
    );
  }
}

/**
 * A new salon's starting week, as salons in Jordan usually work: Monday off,
 * Friday from 14:00 (after the prayer), other days 10:00–22:00.
 */
export function defaultWeek(): HoursRow[] {
  return [0, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    open_min: weekday === 5 ? 14 * 60 : 10 * 60,
    close_min: 22 * 60,
  }));
}

// Small input readers. A parser returns the clean value or throws; Input.req/opt
// attach the field name so the UI can point at the right input.
import { HttpError } from './http.js';

export type Parser<T> = (v: unknown) => T;

class Invalid extends Error {}

export class Input {
  constructor(private data: Record<string, unknown>) {}

  has(key: string): boolean {
    return this.data[key] !== undefined;
  }

  req<T>(key: string, parse: Parser<T>): T {
    if (!this.has(key)) throw new HttpError(400, 'required', key);
    return this.run(key, parse);
  }

  /** For PATCH: undefined when the field was not sent. */
  opt<T>(key: string, parse: Parser<T>): T | undefined {
    return this.has(key) ? this.run(key, parse) : undefined;
  }

  private run<T>(key: string, parse: Parser<T>): T {
    try {
      return parse(this.data[key]);
    } catch (err) {
      if (err instanceof Invalid) throw new HttpError(400, 'invalid', key);
      throw err;
    }
  }
}

export const text = (max: number, min = 0): Parser<string> => (v) => {
  if (typeof v !== 'string') throw new Invalid();
  // Strip control characters except newlines; keep bidi marks people rely on.
  const s = v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
  if (s.length < min || s.length > max) throw new Invalid();
  return s;
};

export const bool: Parser<boolean> = (v) => {
  if (typeof v !== 'boolean') throw new Invalid();
  return v;
};

export const int = (min: number, max: number): Parser<number> => (v) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Invalid();
  return v;
};

export const oneOf = <T extends string>(values: readonly T[]): Parser<T> => (v) => {
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) throw new Invalid();
  return v as T;
};

export const color: Parser<string> = (v) => {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Invalid();
  return v.toLowerCase();
};

/** A price as a decimal string with at most `decimals` fraction digits, e.g. "12.5". */
export const price = (decimals: number): Parser<string> => (v) => {
  const s = typeof v === 'number' ? String(v) : v;
  if (typeof s !== 'string') throw new Invalid();
  const m = /^(\d{1,7})(?:\.(\d+))?$/.exec(s.trim());
  if (!m || (m[2] ?? '').length > decimals) throw new Invalid();
  return s.trim();
};

export const idList: Parser<number[]> = (v) => {
  if (!Array.isArray(v) || v.length > 500) throw new Invalid();
  for (const id of v) if (!Number.isSafeInteger(id) || id <= 0) throw new Invalid();
  return [...new Set(v as number[])];
};

export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
  return id;
}

export const TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));
export const timezone: Parser<string> = (v) => {
  if (typeof v !== 'string' || !TIMEZONES.has(v)) throw new Invalid();
  return v;
};

// Currencies offered in the owner's settings, with their minor-unit digits.
export const CURRENCIES: Record<string, number> = {
  SAR: 2, AED: 2, QAR: 2, KWD: 3, BHD: 3, OMR: 3, JOD: 3, EGP: 2, IQD: 0, MAD: 2, TND: 3, USD: 2, EUR: 2,
};
export const currency: Parser<string> = (v) => {
  if (typeof v !== 'string' || !(v in CURRENCIES)) throw new Invalid();
  return v;
};

import pg from 'pg';
import { config } from './config.js';

// int8 ids fit comfortably in a JS number; numeric (prices) stays a string.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
const INT8_ARRAY = 1016 as Parameters<typeof pg.types.getTypeParser>[0];
const parseInt8Array = pg.types.getTypeParser(INT8_ARRAY);
pg.types.setTypeParser(INT8_ARRAY, (v: string) => (parseInt8Array(v) as string[]).map(Number));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T | undefined> {
  const rows = await query<T>(sql, params, db);
  return rows[0];
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

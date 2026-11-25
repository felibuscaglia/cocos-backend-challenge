import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const SEED_INSERTS = readFileSync(
  join(__dirname, '..', '..', 'src', 'database', 'seed.sql'),
  'utf8',
)
  .split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement.startsWith('INSERT'))
  .join(';\n');

export const SEED_ORDERS_COUNT = 11;

// Vuelve la base al estado del seed, con los ids reiniciados: la primera orden nueva es la 12.
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `TRUNCATE orders, marketdata, instruments, users RESTART IDENTITY CASCADE;
     ${SEED_INSERTS};`,
  );
}

export interface OrderRow {
  id: number;
  userid: number;
  ticker: string;
  side: string;
  type: string;
  size: number;
  price: string;
  status: string;
  datetime: Date;
}

export async function findOrder(
  dataSource: DataSource,
  id: number,
): Promise<OrderRow | undefined> {
  const [row] = await dataSource.query<OrderRow[]>(
    `SELECT o.id, o.userid, i.ticker, o.side, o.type, o.size, o.price, o.status, o.datetime
     FROM orders o
     JOIN instruments i ON i.id = o.instrumentid
     WHERE o.id = $1`,
    [id],
  );
  return row;
}

export async function countOrders(dataSource: DataSource): Promise<number> {
  const [{ count }] = await dataSource.query<{ count: string }[]>(
    'SELECT COUNT(*) AS count FROM orders',
  );
  return Number(count);
}

// Calculados con SQL propio, sin pasar por el código de la app.
export async function availableCash(
  dataSource: DataSource,
  userId: number,
): Promise<number> {
  const [{ total }] = await dataSource.query<{ total: string }[]>(
    `SELECT COALESCE(SUM(CASE
       WHEN status = 'FILLED' AND side IN ('CASH_IN', 'SELL') THEN size * price
       WHEN status = 'FILLED' AND side IN ('CASH_OUT', 'BUY') THEN -size * price
       WHEN status = 'NEW' AND side = 'BUY' THEN -size * price
       ELSE 0
     END), 0) AS total
     FROM orders
     WHERE userid = $1`,
    [userId],
  );
  return Number(total);
}

export async function availableShares(
  dataSource: DataSource,
  userId: number,
  ticker: string,
): Promise<number> {
  const [{ total }] = await dataSource.query<{ total: string }[]>(
    `SELECT COALESCE(SUM(CASE
       WHEN o.status = 'FILLED' AND o.side = 'BUY' THEN o.size
       WHEN o.status = 'FILLED' AND o.side = 'SELL' THEN -o.size
       WHEN o.status = 'NEW' AND o.side = 'SELL' THEN -o.size
       ELSE 0
     END), 0) AS total
     FROM orders o
     JOIN instruments i ON i.id = o.instrumentid
     WHERE o.userid = $1 AND i.ticker = $2`,
    [userId, ticker],
  );
  return Number(total);
}

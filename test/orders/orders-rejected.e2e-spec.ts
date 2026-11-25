import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REJECTION_MESSAGES } from '../../src/orders/lib/constants';
import type { RejectionCode } from '../../src/orders/lib/constants';
import { createTestApp } from '../utils/app';
import { findOrder, resetDatabase } from '../utils/database';
import { postOrder } from '../utils/orders';

describe('POST /orders: órdenes rechazadas', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(() => resetDatabase(dataSource));

  afterAll(() => app.close());

  async function expectRejected(
    res: { status: number; body: unknown },
    code: RejectionCode,
    saved: { id?: number; size: number; price: string },
  ): Promise<void> {
    const id = saved.id ?? 12;
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id,
      status: 'REJECTED',
      size: saved.size,
      rejection: { code, message: REJECTION_MESSAGES[code] },
    });
    expect(await findOrder(dataSource, id)).toMatchObject({
      status: 'REJECTED',
      size: saved.size,
      price: saved.price,
    });
  }

  it('BUY por más que availableCash → INSUFFICIENT_FUNDS', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10000,
    });

    await expectRejected(res, 'INSUFFICIENT_FUNDS', {
      size: 10000,
      price: '925.85',
    });
  });

  it('BUY que entra en el efectivo total pero no en el disponible → INSUFFICIENT_FUNDS', async () => {
    // 3000 × 229.50 = 688500: menos que los 753000 totales, más que los 627500 disponibles.
    const res = await postOrder(app, 1, {
      ticker: 'METR',
      side: 'BUY',
      type: 'MARKET',
      size: 3000,
    });

    await expectRejected(res, 'INSUFFICIENT_FUNDS', {
      size: 3000,
      price: '229.50',
    });
  });

  it('LIMIT BUY sin fondos suficientes → INSUFFICIENT_FUNDS', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'METR',
      side: 'BUY',
      type: 'LIMIT',
      size: 3000,
      price: '229.50',
    });

    await expectRejected(res, 'INSUFFICIENT_FUNDS', {
      size: 3000,
      price: '229.50',
    });
  });

  it('dos LIMIT BUY que juntas superan lo disponible → la segunda REJECTED', async () => {
    const order = {
      ticker: 'METR',
      side: 'BUY',
      type: 'LIMIT',
      size: 2000,
      price: '229.50',
    };

    const first = await postOrder(app, 1, order);
    const second = await postOrder(app, 1, order);

    expect(first.body).toMatchObject({ id: 12, status: 'NEW' });
    await expectRejected(second, 'INSUFFICIENT_FUNDS', {
      id: 13,
      size: 2000,
      price: '229.50',
    });
  });

  it('usuario sin efectivo compra 1 acción → INSUFFICIENT_FUNDS', async () => {
    const res = await postOrder(app, 2, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    await expectRejected(res, 'INSUFFICIENT_FUNDS', {
      size: 1,
      price: '925.85',
    });
  });

  it('SELL por más que la tenencia → INSUFFICIENT_SHARES', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'MARKET',
      size: 41,
    });

    await expectRejected(res, 'INSUFFICIENT_SHARES', {
      size: 41,
      price: '925.85',
    });
  });

  it('SELL de un activo que no tiene → INSUFFICIENT_SHARES', async () => {
    const res = await postOrder(app, 2, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });

    await expectRejected(res, 'INSUFFICIENT_SHARES', {
      size: 1,
      price: '925.85',
    });
  });

  it('SELL sobre la posición negativa del seed (BMA) → INSUFFICIENT_SHARES', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'BMA',
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });

    await expectRejected(res, 'INSUFFICIENT_SHARES', {
      size: 1,
      price: '1502.80',
    });
  });

  it('SELL bloqueada por una SELL NEW que reserva las acciones → INSUFFICIENT_SHARES', async () => {
    await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'LIMIT',
      size: 40,
      price: '1000',
    });

    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });

    await expectRejected(res, 'INSUFFICIENT_SHARES', {
      id: 13,
      size: 1,
      price: '925.85',
    });
  });

  it('SELL por monto mayor que la tenencia → INSUFFICIENT_SHARES con el size calculado', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'MARKET',
      amount: '50000',
    });

    await expectRejected(res, 'INSUFFICIENT_SHARES', {
      size: 54,
      price: '925.85',
    });
  });

  it('monto que no alcanza para una acción → AMOUNT_TOO_LOW con size 0', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      amount: '500',
    });

    await expectRejected(res, 'AMOUNT_TOO_LOW', {
      size: 0,
      price: '925.85',
    });
  });

  it.each(['PGR', 'IRCP'])(
    'MARKET sobre %s → NO_MARKET_DATA con price 0',
    async (ticker) => {
      const res = await postOrder(app, 1, {
        ticker,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      });

      await expectRejected(res, 'NO_MARKET_DATA', { size: 1, price: '0.00' });
      expect(res.body).toMatchObject({ price: '0' });
    },
  );

  it('LIMIT sobre PGR → NO_MARKET_DATA con el precio límite', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PGR',
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
      price: '100',
    });

    await expectRejected(res, 'NO_MARKET_DATA', { size: 1, price: '100.00' });
    expect(res.body).toMatchObject({ price: '100' });
  });

  it('MARKET por monto sobre PGR → NO_MARKET_DATA con size 0 y price 0', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PGR',
      side: 'BUY',
      type: 'MARKET',
      amount: '1000',
    });

    await expectRejected(res, 'NO_MARKET_DATA', { size: 0, price: '0.00' });
  });

  it('CASH_OUT por más que availableCash → INSUFFICIENT_FUNDS', async () => {
    const res = await postOrder(app, 2, {
      ticker: 'ARS',
      side: 'CASH_OUT',
      type: 'MARKET',
      amount: '1',
    });

    await expectRejected(res, 'INSUFFICIENT_FUNDS', { size: 1, price: '1.00' });
  });

  it('CASH_OUT que entra en el total pero no en el disponible → INSUFFICIENT_FUNDS', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'ARS',
      side: 'CASH_OUT',
      type: 'MARKET',
      amount: '700000',
    });

    await expectRejected(res, 'INSUFFICIENT_FUNDS', {
      size: 700000,
      price: '1.00',
    });
  });

  it('prioridad: sin datos de mercado y monto bajo → NO_MARKET_DATA', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PGR',
      side: 'BUY',
      type: 'LIMIT',
      amount: '1',
      price: '100',
    });

    await expectRejected(res, 'NO_MARKET_DATA', { size: 0, price: '100.00' });
  });

  it('prioridad: sin efectivo y monto bajo → AMOUNT_TOO_LOW', async () => {
    const res = await postOrder(app, 2, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      amount: '100',
    });

    await expectRejected(res, 'AMOUNT_TOO_LOW', {
      size: 0,
      price: '925.85',
    });
  });

  it('una orden REJECTED no consume saldo: una orden válida posterior se ejecuta', async () => {
    await postOrder(app, 2, {
      ticker: 'ARS',
      side: 'CASH_IN',
      type: 'MARKET',
      amount: '10000',
    });
    const rejected = await postOrder(app, 2, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10000,
    });
    const filled = await postOrder(app, 2, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
    });

    expect(rejected.body).toMatchObject({ status: 'REJECTED' });
    expect(filled.body).toMatchObject({ id: 14, status: 'FILLED' });
    expect(await findOrder(dataSource, 14)).toMatchObject({
      status: 'FILLED',
    });
  });
});

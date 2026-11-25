import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { createTestApp } from '../utils/app';
import {
  countOrders,
  resetDatabase,
  SEED_ORDERS_COUNT,
} from '../utils/database';
import { expectErrorResponse, postOrder } from '../utils/orders';

const MARKET_BUY = { ticker: 'PAMP', side: 'BUY', type: 'MARKET', size: 1 };
const LIMIT_BUY = { ticker: 'PAMP', side: 'BUY', type: 'LIMIT', size: 1 };
const CASH_IN = { ticker: 'ARS', side: 'CASH_IN', type: 'MARKET' };

describe('POST /orders: validaciones (400) y recursos inexistentes (404)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(() => resetDatabase(dataSource));

  afterEach(async () => {
    expect(await countOrders(dataSource)).toBe(SEED_ORDERS_COUNT);
  });

  afterAll(() => app.close());

  describe('404', () => {
    it.each([
      ['sin header', null],
      ['0', '0'],
      ['-1', '-1'],
      ['999', '999'],
    ])('X-User-Id %s → Usuario no encontrado', async (_, userId) => {
      const res = await postOrder(app, userId, MARKET_BUY);

      expectErrorResponse(res, 404, 'Not Found', 'Usuario no encontrado');
    });

    it('ticker inexistente → Instrumento no encontrado', async () => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, ticker: 'XXXX' });

      expectErrorResponse(res, 404, 'Not Found', 'Instrumento no encontrado');
    });

    it('ticker en minúsculas → Instrumento no encontrado', async () => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, ticker: 'pamp' });

      expectErrorResponse(res, 404, 'Not Found', 'Instrumento no encontrado');
    });

    it('header inválido con body inválido → 404 (el header se valida primero)', async () => {
      const res = await postOrder(app, 999, {});

      expectErrorResponse(res, 404, 'Not Found', 'Usuario no encontrado');
    });
  });

  describe('400', () => {
    // Comportamiento actual: Postgres rechaza el id no entero antes de buscar el usuario.
    // docs/decisiones/api.md pide 404 para estos casos.
    it.each(['abc', '1.5'])(
      'X-User-Id %s → 400 Formato inválido',
      async (userId) => {
        const res = await postOrder(app, userId, MARKET_BUY);

        expectErrorResponse(res, 400, 'Bad Request', 'Formato inválido');
      },
    );

    it('JSON mal formado', async () => {
      const res = await postOrder(app, 1, '{"ticker": ');

      expectErrorResponse(res, 400, 'Bad Request');
    });

    it.each(['datetime', 'userId'])('campo desconocido %s', async (field) => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, [field]: 1 });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        `property ${field} should not exist`,
      );
    });

    it.each([
      ['ticker', 'ticker debe ser un texto'],
      ['side', 'side debe ser uno de: BUY, SELL, CASH_IN, CASH_OUT'],
      ['type', 'type debe ser uno de: MARKET, LIMIT'],
    ])('falta %s', async (field, message) => {
      const body: Record<string, unknown> = { ...MARKET_BUY };
      delete body[field];

      const res = await postOrder(app, 1, body);

      expectErrorResponse(res, 400, 'Bad Request', message);
    });

    it('side fuera de la lista', async () => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, side: 'HOLD' });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'side debe ser uno de: BUY, SELL, CASH_IN, CASH_OUT',
      );
    });

    it('type fuera de la lista', async () => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, type: 'STOP' });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'type debe ser uno de: MARKET, LIMIT',
      );
    });

    it('BUY sin size ni amount', async () => {
      const res = await postOrder(app, 1, {
        ticker: 'PAMP',
        side: 'BUY',
        type: 'MARKET',
      });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'Se debe enviar size o amount, pero no ambos',
      );
    });

    it('BUY con size y amount a la vez', async () => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, amount: '1000' });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'Se debe enviar size o amount, pero no ambos',
      );
    });

    it.each([
      [0, 'size debe ser mayor a 0'],
      [-1, 'size debe ser mayor a 0'],
      [1.5, 'size debe ser un entero'],
      ['abc', 'size debe ser un entero'],
    ])('size %s', async (size, message) => {
      const res = await postOrder(app, 1, { ...MARKET_BUY, size });

      expectErrorResponse(res, 400, 'Bad Request', message);
    });

    it.each(['0', '-1', '100.001', 'abc'])('amount %s', async (amount) => {
      const res = await postOrder(app, 1, {
        ticker: 'PAMP',
        side: 'BUY',
        type: 'MARKET',
        amount,
      });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'amount debe ser un número decimal mayor a 0, con hasta 2 decimales',
      );
    });

    it('LIMIT sin price', async () => {
      const res = await postOrder(app, 1, LIMIT_BUY);

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'price es obligatorio en órdenes LIMIT y debe ser un texto',
      );
    });

    it.each(['0', '-5', '900.001'])('LIMIT con price %s', async (price) => {
      const res = await postOrder(app, 1, { ...LIMIT_BUY, price });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'price debe ser un número decimal mayor a 0, con hasta 2 decimales',
      );
    });

    it.each(['BUY', 'SELL'])('%s sobre ARS', async (side) => {
      const res = await postOrder(app, 1, {
        ...MARKET_BUY,
        side,
        ticker: 'ARS',
      });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'Solo se pueden comprar o vender instrumentos de tipo ACCIONES',
      );
    });

    it.each(['CASH_IN', 'CASH_OUT'])(
      '%s sobre un ticker distinto de ARS',
      async (side) => {
        const res = await postOrder(app, 1, {
          ...CASH_IN,
          side,
          ticker: 'PAMP',
          amount: '1000',
        });

        expectErrorResponse(
          res,
          400,
          'Bad Request',
          'Las órdenes CASH_IN y CASH_OUT solo se pueden enviar con ticker ARS',
        );
      },
    );

    it.each(['CASH_IN', 'CASH_OUT'])('%s con type LIMIT', async (side) => {
      const res = await postOrder(app, 1, {
        ...CASH_IN,
        side,
        type: 'LIMIT',
        amount: '1000',
      });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'Las órdenes CASH_IN y CASH_OUT solo se pueden enviar con type MARKET',
      );
    });

    it.each(['CASH_IN', 'CASH_OUT'])('%s sin amount', async (side) => {
      const res = await postOrder(app, 1, { ...CASH_IN, side });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'Las órdenes CASH_IN y CASH_OUT requieren amount',
      );
    });

    it.each(['CASH_IN', 'CASH_OUT'])('%s con amount decimal', async (side) => {
      const res = await postOrder(app, 1, {
        ...CASH_IN,
        side,
        amount: '100.5',
      });

      expectErrorResponse(
        res,
        400,
        'Bad Request',
        'Las órdenes CASH_IN y CASH_OUT solo aceptan montos enteros',
      );
    });
  });
});

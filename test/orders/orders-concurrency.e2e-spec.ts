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
  availableCash,
  availableShares,
  resetDatabase,
} from '../utils/database';
import { postOrder } from '../utils/orders';

describe('POST /orders: concurrencia', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(() => resetDatabase(dataSource));

  afterEach(async () => {
    expect(await availableCash(dataSource, 1)).toBeGreaterThanOrEqual(0);
    expect(await availableShares(dataSource, 1, 'PAMP')).toBeGreaterThanOrEqual(
      0,
    );
  });

  afterAll(() => app.close());

  function sortedStatuses(...responses: { body: unknown }[]): string[] {
    return responses
      .map((res) => (res.body as { status: string }).status)
      .sort();
  }

  function rejectionCodes(...responses: { body: unknown }[]): string[] {
    return responses
      .map((res) => (res.body as { rejection?: { code: string } }).rejection)
      .filter((rejection) => rejection !== undefined)
      .map((rejection) => rejection.code);
  }

  it('dos BUY simultáneas que juntas superan lo disponible → una FILLED y otra INSUFFICIENT_FUNDS', async () => {
    // 2000 × 229.50 = 459000 cada una; juntas superan los 627500 disponibles.
    const order = { ticker: 'METR', side: 'BUY', type: 'MARKET', size: 2000 };

    const responses = await Promise.all([
      postOrder(app, 1, order),
      postOrder(app, 1, order),
    ]);

    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(sortedStatuses(...responses)).toEqual(['FILLED', 'REJECTED']);
    expect(rejectionCodes(...responses)).toEqual(['INSUFFICIENT_FUNDS']);
  });

  it('dos SELL simultáneas que juntas superan las acciones → una FILLED y otra INSUFFICIENT_SHARES', async () => {
    const order = { ticker: 'PAMP', side: 'SELL', type: 'MARKET', size: 30 };

    const responses = await Promise.all([
      postOrder(app, 1, order),
      postOrder(app, 1, order),
    ]);

    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(sortedStatuses(...responses)).toEqual(['FILLED', 'REJECTED']);
    expect(rejectionCodes(...responses)).toEqual(['INSUFFICIENT_SHARES']);
  });

  it('CASH_OUT y BUY simultáneos que juntos superan lo disponible → uno FILLED y otro REJECTED', async () => {
    // 400000 + 459000 superan los 627500 disponibles; cada uno por separado entra.
    const responses = await Promise.all([
      postOrder(app, 1, {
        ticker: 'ARS',
        side: 'CASH_OUT',
        type: 'MARKET',
        amount: '400000',
      }),
      postOrder(app, 1, {
        ticker: 'METR',
        side: 'BUY',
        type: 'MARKET',
        size: 2000,
      }),
    ]);

    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(sortedStatuses(...responses)).toEqual(['FILLED', 'REJECTED']);
    expect(rejectionCodes(...responses)).toEqual(['INSUFFICIENT_FUNDS']);
  });
});

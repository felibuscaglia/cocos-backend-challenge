import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../utils/app';
import { findOrder, resetDatabase } from '../utils/database';
import { ORDER_RESPONSE_KEYS, postOrder } from '../utils/orders';

describe('POST /orders: órdenes ejecutadas y aceptadas', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(() => resetDatabase(dataSource));

  afterAll(() => app.close());

  it('MARKET BUY por size se ejecuta al último close', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 12,
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
      price: '925.85',
      status: 'FILLED',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      userid: 1,
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
      price: '925.85',
      status: 'FILLED',
    });
  });

  it('MARKET SELL por size dentro de la tenencia se ejecuta', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'MARKET',
      size: 10,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      side: 'SELL',
      size: 10,
      price: '925.85',
      status: 'FILLED',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      side: 'SELL',
      size: 10,
      price: '925.85',
      status: 'FILLED',
    });
  });

  it('MARKET BUY por amount redondea size hacia abajo', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      amount: '50000',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      size: 54,
      price: '925.85',
      status: 'FILLED',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      size: 54,
      price: '925.85',
      status: 'FILLED',
    });
  });

  it('MARKET SELL por amount redondea size hacia abajo', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'MARKET',
      amount: '9000',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      side: 'SELL',
      size: 9,
      status: 'FILLED',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      side: 'SELL',
      size: 9,
      status: 'FILLED',
    });
  });

  it('LIMIT BUY por size queda NEW al precio límite', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'LIMIT',
      size: 10,
      price: '900',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'LIMIT',
      size: 10,
      price: '900',
      status: 'NEW',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      type: 'LIMIT',
      size: 10,
      price: '900.00',
      status: 'NEW',
    });
  });

  it('LIMIT BUY por amount calcula size con el precio límite', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'LIMIT',
      amount: '50000',
      price: '900',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ size: 55, price: '900', status: 'NEW' });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      size: 55,
      price: '900.00',
      status: 'NEW',
    });
  });

  it('LIMIT SELL queda NEW', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'SELL',
      type: 'LIMIT',
      size: 40,
      price: '1000',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      side: 'SELL',
      type: 'LIMIT',
      size: 40,
      price: '1000',
      status: 'NEW',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      side: 'SELL',
      size: 40,
      price: '1000.00',
      status: 'NEW',
    });
  });

  it('LIMIT BUY con precio por encima del mercado sigue NEW', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'LIMIT',
      size: 10,
      price: '1000',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ price: '1000', status: 'NEW' });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      price: '1000.00',
      status: 'NEW',
    });
  });

  it('MARKET ignora el price del body y usa el último close', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
      price: '1',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ price: '925.85', status: 'FILLED' });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      price: '925.85',
    });
  });

  it('CASH_IN se ejecuta sobre ARS con size = amount y price 1', async () => {
    const res = await postOrder(app, 2, {
      ticker: 'ARS',
      side: 'CASH_IN',
      type: 'MARKET',
      amount: '10000',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticker: 'ARS',
      side: 'CASH_IN',
      type: 'MARKET',
      size: 10000,
      price: '1',
      status: 'FILLED',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      userid: 2,
      ticker: 'ARS',
      side: 'CASH_IN',
      type: 'MARKET',
      size: 10000,
      price: '1.00',
      status: 'FILLED',
    });
  });

  it('CASH_IN ignora el size del body', async () => {
    const res = await postOrder(app, 2, {
      ticker: 'ARS',
      side: 'CASH_IN',
      type: 'MARKET',
      amount: '10000',
      size: 5,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ size: 10000, status: 'FILLED' });
    expect(await findOrder(dataSource, 12)).toMatchObject({ size: 10000 });
  });

  it('CASH_OUT dentro de availableCash se ejecuta', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'ARS',
      side: 'CASH_OUT',
      type: 'MARKET',
      amount: '627500',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      side: 'CASH_OUT',
      size: 627500,
      price: '1',
      status: 'FILLED',
    });
    expect(await findOrder(dataSource, 12)).toMatchObject({
      side: 'CASH_OUT',
      size: 627500,
      status: 'FILLED',
    });
  });

  it('el usuario 2 puede comprar después de un CASH_IN', async () => {
    await postOrder(app, 2, {
      ticker: 'ARS',
      side: 'CASH_IN',
      type: 'MARKET',
      amount: '10000',
    });

    const res = await postOrder(app, 2, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 13, status: 'FILLED' });
    expect(await findOrder(dataSource, 13)).toMatchObject({
      userid: 2,
      status: 'FILLED',
    });
  });

  it('guarda un datetime no nulo y reciente, igual al de la respuesta', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    const row = await findOrder(dataSource, 12);
    expect(row?.datetime).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - row!.datetime.getTime())).toBeLessThan(60_000);
    expect(new Date((res.body as { datetime: string }).datetime)).toEqual(
      row!.datetime,
    );
  });

  it('la respuesta tiene solo los campos acordados, sin userId, instrumentId ni rejection', async () => {
    const res = await postOrder(app, 1, {
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    expect(Object.keys(res.body as object).sort()).toEqual(ORDER_RESPONSE_KEYS);
  });
});

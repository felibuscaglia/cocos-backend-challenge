import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import request, { Response } from 'supertest';
import { expect } from 'vitest';

export function postOrder(
  app: INestApplication,
  userId: number | string | null,
  body: string | object,
): Promise<Response> {
  const req = request(app.getHttpServer() as Server).post('/orders');
  if (userId !== null) req.set('X-User-Id', String(userId));
  if (typeof body === 'string') req.set('Content-Type', 'application/json');
  return req.send(body);
}

export const ORDER_RESPONSE_KEYS = [
  'datetime',
  'id',
  'price',
  'side',
  'size',
  'status',
  'ticker',
  'type',
];

export function expectErrorResponse(
  res: Response,
  statusCode: number,
  error: string,
  message?: string,
): void {
  expect(res.status).toBe(statusCode);
  expect(Object.keys(res.body as object).sort()).toEqual([
    'error',
    'message',
    'path',
    'statusCode',
    'timestamp',
  ]);
  const body = res.body as Record<string, unknown>;
  expect(body.statusCode).toBe(statusCode);
  expect(body.error).toBe(error);
  expect(body.path).toBe('/orders');
  expect(new Date(body.timestamp as string).toISOString()).toBe(body.timestamp);
  if (message !== undefined) {
    expect([body.message].flat()).toContain(message);
  }
}

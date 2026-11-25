import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderSide, OrderStatus } from './enums';
import { Order } from './order.entity';

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order) private readonly repository: Repository<Order>,
  ) {}

  // Devuelve un string porque Postgres entrega NUMERIC como texto y así no se pierde precisión.
  async sumOrderTotals(
    userId: number,
    status: OrderStatus,
    sides: OrderSide[],
  ): Promise<string> {
    const [{ total }] = await this.repository.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(size * price), 0) AS total
       FROM orders
       WHERE userid = $1 AND status = $2 AND side = ANY($3)`,
      [userId, status, sides],
    );
    return total;
  }

  async sumOrderShares(
    userId: number,
    instrumentId: number,
    status: OrderStatus,
    side: OrderSide,
  ): Promise<number> {
    const [{ total }] = await this.repository.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(size), 0) AS total
       FROM orders
       WHERE userid = $1 AND instrumentid = $2 AND status = $3 AND side = $4`,
      [userId, instrumentId, status, side],
    );
    return Number(total);
  }
}

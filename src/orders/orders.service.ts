import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { OrderSide, OrderStatus } from './enums';
import { CashSummary, Position } from './interfaces';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async calculateCashBalances(userId: number): Promise<CashSummary> {
    const [inflows, outflows, reserved] = await Promise.all([
      this.ordersRepository.sumOrderTotals(userId, OrderStatus.FILLED, [
        OrderSide.CASH_IN,
        OrderSide.SELL,
      ]),
      this.ordersRepository.sumOrderTotals(userId, OrderStatus.FILLED, [
        OrderSide.CASH_OUT,
        OrderSide.BUY,
      ]),
      this.ordersRepository.sumOrderTotals(userId, OrderStatus.NEW, [
        OrderSide.BUY,
      ]),
    ]);

    const totalCash = new Decimal(inflows).minus(outflows);
    const reservedCash = new Decimal(reserved);

    return {
      totalCash: totalCash.toString(),
      reservedCash: reservedCash.toString(),
      availableCash: totalCash.minus(reservedCash).toString(),
    };
  }

  async calculateAvailableShares(
    userId: number,
    instrumentId: number,
  ): Promise<number> {
    const [bought, sold, pendingSales] = await Promise.all([
      this.ordersRepository.sumOrderShares(
        userId,
        instrumentId,
        OrderStatus.FILLED,
        OrderSide.BUY,
      ),
      this.ordersRepository.sumOrderShares(
        userId,
        instrumentId,
        OrderStatus.FILLED,
        OrderSide.SELL,
      ),
      this.ordersRepository.sumOrderShares(
        userId,
        instrumentId,
        OrderStatus.NEW,
        OrderSide.SELL,
      ),
    ]);

    return bought - sold - pendingSales;
  }

  findPositions(userId: number): Promise<Position[]> {
    return this.ordersRepository.findPositions(userId);
  }
}

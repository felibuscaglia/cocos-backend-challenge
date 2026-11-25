import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { OrdersService } from '../orders/orders.service';
import { PortfolioDto, PositionDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly ordersService: OrdersService) {}

  async getPortfolio(userId: number): Promise<PortfolioDto> {
    const [cash, positions] = await Promise.all([
      this.ordersService.calculateCashBalances(userId),
      this.ordersService.findPositions(userId),
    ]);

    const positionDtos = positions.map((position) =>
      PositionDto.fromPosition(position),
    );
    const totalValue = positionDtos.reduce(
      (total, position) => total.plus(position.marketValue),
      new Decimal(cash.availableCash).plus(cash.reservedCash),
    );

    return {
      totalValue: totalValue.toString(),
      availableCash: cash.availableCash,
      reservedCash: cash.reservedCash,
      positions: positionDtos,
    };
  }
}

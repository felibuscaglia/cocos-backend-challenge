import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { InstrumentType } from '../instruments/enums';
import { InstrumentsRepository } from '../instruments/instruments.repository';
import { User } from '../users/user.entity';
import { CreatedOrderDto, CreateOrderDto } from './dto';
import { OrderSide, OrderStatus, OrderType } from './enums';
import { CashSummary, Position } from './interfaces';
import { REJECTION_MESSAGES } from './lib/constants';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly instrumentsRepository: InstrumentsRepository,
  ) {}

  async createOrder(
    user: User,
    { ticker, side, type, size, amount, price }: CreateOrderDto,
  ): Promise<CreatedOrderDto> {
    const result = await this.instrumentsRepository.findByTicker(ticker);

    if (!result) {
      throw new NotFoundException('Instrumento no encontrado');
    }

    const { instrument, latestClose } = result;
    const isTrade = side === OrderSide.BUY || side === OrderSide.SELL;

    if (isTrade && instrument.type !== InstrumentType.ACCIONES) {
      throw new BadRequestException(
        'Solo se pueden comprar o vender instrumentos de tipo ACCIONES',
      );
    }

    // Las transferencias van a precio 1 porque el efectivo se calcula como size × price.
    // El DTO exige price en LIMIT.
    const orderPrice = !isTrade
      ? '1'
      : type === OrderType.MARKET
        ? (latestClose ?? '0')
        : price!;
    // El DTO exige size o amount en BUY/SELL.
    // Sin precio (MARKET sin datos de mercado) la cantidad no se puede calcular y queda en 0.
    const orderSize =
      isTrade && amount !== undefined
        ? new Decimal(orderPrice).isZero()
          ? 0
          : new Decimal(amount).div(orderPrice).floor().toNumber()
        : size!;
    let rejection: CreatedOrderDto['rejection'];

    if (isTrade && latestClose === null) {
      rejection = {
        code: 'NO_MARKET_DATA',
        message: REJECTION_MESSAGES.NO_MARKET_DATA,
      };
    } else if (orderSize === 0) {
      rejection = {
        code: 'AMOUNT_TOO_LOW',
        message: REJECTION_MESSAGES.AMOUNT_TOO_LOW,
      };
    } else if (side === OrderSide.BUY || side === OrderSide.CASH_OUT) {
      const { availableCash } = await this.calculateCashBalances(user.id);

      if (new Decimal(orderSize).times(orderPrice).gt(availableCash)) {
        rejection = {
          code: 'INSUFFICIENT_FUNDS',
          message: REJECTION_MESSAGES.INSUFFICIENT_FUNDS,
        };
      }
    } else if (side === OrderSide.SELL) {
      const availableShares = await this.calculateAvailableShares(
        user.id,
        instrument.id,
      );

      if (orderSize > availableShares) {
        rejection = {
          code: 'INSUFFICIENT_SHARES',
          message: REJECTION_MESSAGES.INSUFFICIENT_SHARES,
        };
      }
    }

    const status = rejection
      ? OrderStatus.REJECTED
      : isTrade && type === OrderType.LIMIT
        ? OrderStatus.NEW
        : OrderStatus.FILLED;

    const datetime = new Date();
    const order = await this.ordersRepository.save({
      userId: user.id,
      instrumentId: instrument.id,
      side,
      type,
      size: orderSize,
      price: orderPrice,
      status,
      datetime,
    });

    return {
      id: order.id,
      ticker: instrument.ticker,
      size: orderSize,
      price: orderPrice,
      type,
      side,
      status,
      datetime,
      rejection,
    };
  }

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

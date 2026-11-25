import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { REJECTION_MESSAGES } from './lib/constants';
import { CurrentUser } from '../common/decorators';
import { User } from '../users/user.entity';
import { CreatedOrderDto, CreateOrderDto } from './dto';
import { OrdersService } from './orders.service';

@ApiTags('Órdenes')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Enviar una orden' })
  @ApiCreatedResponse({
    description:
      'La orden se guardó. Si no puede ejecutarse, queda con status REJECTED y el motivo en rejection.',
    type: CreatedOrderDto,
    examples: {
      filled: {
        summary: 'Compra MARKET ejecutada (FILLED)',
        value: {
          id: 12,
          ticker: 'PAMP',
          size: 10,
          price: '925.85',
          type: 'MARKET',
          side: 'BUY',
          status: 'FILLED',
          datetime: '2026-11-24T15:30:00.000Z',
        },
      },
      rejected: {
        summary: 'Compra MARKET rechazada por efectivo insuficiente (REJECTED)',
        value: {
          id: 13,
          ticker: 'PAMP',
          size: 10000,
          price: '925.85',
          type: 'MARKET',
          side: 'BUY',
          status: 'REJECTED',
          datetime: '2026-11-24T15:31:00.000Z',
          rejection: {
            code: 'INSUFFICIENT_FUNDS',
            message: REJECTION_MESSAGES.INSUFFICIENT_FUNDS,
          },
        },
      },
    },
  })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateOrderDto,
  ): Promise<CreatedOrderDto> {
    return this.ordersService.createOrder(user, dto);
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { REJECTION_MESSAGES } from './lib/constants';
import { CurrentUser } from '../common/decorators';
import { ErrorResponseDto } from '../common/dto';
import { User } from '../users/user.entity';
import { CreatedOrderDto, CreateOrderDto } from './dto';
import { Order } from './order.entity';
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

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una orden' })
  @ApiParam({ name: 'orderId', description: 'Id de la orden.', example: 14 })
  @ApiOkResponse({
    description: 'La orden se canceló y queda con status CANCELLED.',
    example: {
      id: 14,
      instrumentId: 47,
      userId: 1,
      size: 10,
      price: '930.50',
      type: 'LIMIT',
      side: 'BUY',
      status: 'CANCELLED',
      datetime: '2026-11-24T15:32:00.000Z',
    },
  })
  @ApiNotFoundResponse({
    description: 'La orden no existe.',
    type: ErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Orden no encontrada',
      error: 'Not Found',
      path: '/orders/999/cancel',
      timestamp: '2026-11-24T15:30:00.000Z',
    },
  })
  @ApiConflictResponse({
    description: 'La orden no tiene status NEW.',
    type: ErrorResponseDto,
    example: {
      statusCode: 409,
      message:
        'Solo se pueden cancelar órdenes NEW. La orden tiene estado FILLED',
      error: 'Conflict',
      path: '/orders/12/cancel',
      timestamp: '2026-11-24T15:30:00.000Z',
    },
  })
  cancel(@Param('orderId') orderId: number): Promise<Order> {
    return this.ordersService.cancelOrder(orderId);
  }
}

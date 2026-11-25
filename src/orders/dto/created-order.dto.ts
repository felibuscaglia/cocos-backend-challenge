import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderSide, OrderStatus, OrderType } from '../enums';
import { REJECTION_MESSAGES } from '../lib/constants';
import type { RejectionCode } from '../lib/constants';

export class RejectionDto {
  @ApiProperty({
    description: 'Código del motivo de rechazo.',
    enum: Object.keys(REJECTION_MESSAGES),
    example: 'INSUFFICIENT_FUNDS',
  })
  code: RejectionCode;

  @ApiProperty({
    description: 'Motivo de rechazo.',
    example: REJECTION_MESSAGES.INSUFFICIENT_FUNDS,
  })
  message: string;
}

export class CreatedOrderDto {
  @ApiProperty({ description: 'Id de la orden.', example: 12 })
  id: number;

  @ApiProperty({ description: 'Ticker del instrumento.', example: 'PAMP' })
  ticker: string;

  @ApiProperty({ description: 'Cantidad de acciones o de pesos.', example: 10 })
  size: number;

  @ApiProperty({
    description:
      'Precio en pesos, como string decimal. En MARKET es el último cierre; en LIMIT, el precio límite; en transferencias, 1.',
    example: '925.85',
  })
  price: string;

  @ApiProperty({ description: 'Tipo de orden.', enum: OrderType })
  type: OrderType;

  @ApiProperty({ description: 'Lado de la orden.', enum: OrderSide })
  side: OrderSide;

  @ApiProperty({ description: 'Estado de la orden.', enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({
    description: 'Fecha y hora de la orden en formato ISO 8601.',
    example: '2026-11-24T15:30:00.000Z',
  })
  datetime: Date;

  @ApiPropertyOptional({
    description: 'Motivo de rechazo. Solo está presente si status es REJECTED.',
    type: RejectionDto,
  })
  rejection?: RejectionDto;
}

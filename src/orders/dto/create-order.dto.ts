import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { OrderSide, OrderType } from '../enums';

export class CreateOrderDto {
  @ApiProperty({ description: 'Ticker del instrumento.', example: 'PAMP' })
  @IsString({ message: 'ticker debe ser un texto' })
  ticker: string;

  @ApiProperty({ description: 'Lado de la orden.', enum: OrderSide })
  @IsEnum(OrderSide, {
    message: `side debe ser uno de: ${Object.values(OrderSide).join(', ')}`,
  })
  side: OrderSide;

  @ApiProperty({ description: 'Tipo de orden.', enum: OrderType })
  @IsEnum(OrderType, {
    message: `type debe ser uno de: ${Object.values(OrderType).join(', ')}`,
  })
  type: OrderType;

  @ApiProperty({
    description: 'Cantidad de acciones.',
    minimum: 1,
    example: 10,
  })
  @IsInt({ message: 'size debe ser un entero' })
  @Min(1, { message: 'size debe ser mayor a 0' })
  size: number;

  @ApiPropertyOptional({
    description:
      'Precio límite en pesos, como texto decimal. Obligatorio en LIMIT; en MARKET se ignora.',
    example: '930.50',
  })
  // En MARKET se descarta para que no se use por error más adelante.
  @Transform(({ value, obj }: { value: unknown; obj: CreateOrderDto }) =>
    obj.type === OrderType.MARKET ? undefined : value,
  )
  @ValidateIf((dto: CreateOrderDto) => dto.type === OrderType.LIMIT)
  @IsString({
    message: 'price es obligatorio en órdenes LIMIT y debe ser un texto',
  })
  // Hasta 2 decimales porque `orders.price` es NUMERIC(10, 2): más decimales se redondearían.
  @Matches(/^(?=.*[1-9])\d+(\.\d{1,2})?$/, {
    message:
      'price debe ser un número decimal mayor a 0, con hasta 2 decimales',
  })
  price?: string;
}

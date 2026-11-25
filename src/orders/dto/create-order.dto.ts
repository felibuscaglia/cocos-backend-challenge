import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { ExactlyOneOf } from '../../common/decorators';
import { OrderSide, OrderType } from '../enums';
import { isTrade } from '../lib/helpers';

export class CreateOrderDto {
  @ApiProperty({ description: 'Ticker del instrumento.', example: 'PAMP' })
  @IsString({ message: 'ticker debe ser un texto' })
  @ValidateBy(
    {
      name: 'isArsForTransfers',
      validator: {
        validate: (value: unknown, args) =>
          isTrade((args?.object as CreateOrderDto).side) || value === 'ARS',
      },
    },
    {
      message:
        'Las órdenes CASH_IN y CASH_OUT solo se pueden enviar con ticker ARS',
    },
  )
  ticker: string;

  @ApiProperty({ description: 'Lado de la orden.', enum: OrderSide })
  @IsEnum(OrderSide, {
    message: `side debe ser uno de: ${Object.values(OrderSide).join(', ')}`,
  })
  // Van en side porque size y amount se saltean con ValidateIf según el caso.
  @ExactlyOneOf(
    ['size', 'amount'],
    { message: 'Se debe enviar size o amount, pero no ambos' },
    (dto: CreateOrderDto) => isTrade(dto.side),
  )
  @ValidateBy(
    {
      name: 'hasAmountForTransfers',
      validator: {
        validate: (value: unknown, args) =>
          isTrade(value as OrderSide) ||
          (args?.object as CreateOrderDto).amount !== undefined,
      },
    },
    { message: 'Las órdenes CASH_IN y CASH_OUT requieren amount' },
  )
  side: OrderSide;

  @ApiProperty({ description: 'Tipo de orden.', enum: OrderType })
  @IsEnum(OrderType, {
    message: `type debe ser uno de: ${Object.values(OrderType).join(', ')}`,
  })
  @ValidateBy(
    {
      name: 'isMarketForTransfers',
      validator: {
        validate: (value: unknown, args) =>
          isTrade((args?.object as CreateOrderDto).side) ||
          value === OrderType.MARKET,
      },
    },
    {
      message:
        'Las órdenes CASH_IN y CASH_OUT solo se pueden enviar con type MARKET',
    },
  )
  type: OrderType;

  @ApiPropertyOptional({
    description:
      'Cantidad de acciones. En BUY/SELL se envía size o amount, no ambos; en CASH_IN/CASH_OUT se ignora.',
    minimum: 1,
    example: 10,
  })
  @ValidateIf(
    (dto: CreateOrderDto) => isTrade(dto.side) && dto.size !== undefined,
  )
  @IsInt({ message: 'size debe ser un entero' })
  @Min(1, { message: 'size debe ser mayor a 0' })
  size?: number;

  @ApiPropertyOptional({
    description:
      'Monto en pesos, como texto decimal. Se compran o venden floor(amount ÷ precio) acciones. En BUY/SELL se envía size o amount, no ambos. Obligatorio en CASH_IN/CASH_OUT, solo en pesos enteros.',
    example: '50000',
  })
  @ValidateIf((dto: CreateOrderDto) => dto.amount !== undefined)
  @IsString({ message: 'amount debe ser un texto' })
  @Matches(/^(?=.*[1-9])\d+(\.\d{1,2})?$/, {
    message:
      'amount debe ser un número decimal mayor a 0, con hasta 2 decimales',
  })
  // Las transferencias se guardan como `size` pesos a precio 1, y `size` es entero.
  @ValidateBy(
    {
      name: 'isIntegerForTransfers',
      validator: {
        validate: (value: unknown, args) =>
          isTrade((args?.object as CreateOrderDto).side) ||
          /^\d+$/.test(value as string),
      },
    },
    { message: 'Las órdenes CASH_IN y CASH_OUT solo aceptan montos enteros' },
  )
  amount?: string;

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

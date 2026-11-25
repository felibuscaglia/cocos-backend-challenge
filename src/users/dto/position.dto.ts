import { ApiProperty } from '@nestjs/swagger';
import Decimal from 'decimal.js';
import { Position } from '../../orders/interfaces';

export class PositionDto {
  @ApiProperty({ description: 'Ticker del activo.', example: 'PAMP' })
  ticker: string;

  @ApiProperty({
    description: 'Nombre del activo.',
    example: 'Pampa Holding S.A.',
  })
  name: string;

  @ApiProperty({
    description:
      'Acciones en tenencia. Puede ser negativa si las ventas superan a las compras.',
    example: 40,
  })
  quantity: number;

  @ApiProperty({
    description:
      'Último precio de cierre, como string decimal. Es "0" si el activo no tiene datos de mercado.',
    example: '925.85',
  })
  latestPrice: string;

  @ApiProperty({
    description:
      'Valor de la posición (cantidad × último precio), como string decimal.',
    example: '37034',
  })
  marketValue: string;

  @ApiProperty({
    description:
      'Rendimiento contra el precio promedio de compra, como fracción (0.28 = 28%). Es 0 si el activo no tiene datos de mercado y null si el precio promedio de compra es 0 o no existe.',
    type: Number,
    nullable: true,
    example: -0.004462365591397849,
  })
  totalReturn: number | null;

  static fromPosition(position: Position): PositionDto {
    // Sin datos de mercado, el activo cuenta con precio 0.
    const hasPrice = position.latestPrice !== null;
    // Sin precio promedio de compra el rendimiento no se puede calcular, como en los brokers.
    const hasCost =
      position.ppc !== null && !new Decimal(position.ppc).isZero();

    const dto = new PositionDto();
    dto.ticker = position.ticker;
    dto.name = position.name;
    dto.quantity = Number(position.quantity);
    dto.latestPrice = new Decimal(position.latestPrice ?? 0).toString();
    dto.marketValue = new Decimal(position.marketValue ?? 0).toString();
    dto.totalReturn = null;
    if (hasCost) dto.totalReturn = hasPrice ? Number(position.totalReturn) : 0;
    return dto;
  }
}

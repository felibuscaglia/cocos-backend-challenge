import { ApiProperty } from '@nestjs/swagger';
import { PositionDto } from './position.dto';

export class PortfolioDto {
  @ApiProperty({
    description:
      'Valor total de la cuenta (efectivo disponible + reservado + valor de las posiciones), como string decimal.',
    example: '889756',
  })
  totalValue: string;

  @ApiProperty({
    description: 'Efectivo disponible para operar, como string decimal.',
    example: '627500',
  })
  availableCash: string;

  @ApiProperty({
    description:
      'Efectivo reservado por compras en espera, como string decimal.',
    example: '125500',
  })
  reservedCash: string;

  @ApiProperty({
    description: 'Posiciones por activo, ordenadas por ticker.',
    type: [PositionDto],
  })
  positions: PositionDto[];
}

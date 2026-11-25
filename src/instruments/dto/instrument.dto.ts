import { ApiProperty } from '@nestjs/swagger';
import { InstrumentType } from '../enums';

export class InstrumentDto {
  @ApiProperty({ description: 'Ticker del activo.', example: 'GGAL' })
  ticker: string;

  @ApiProperty({
    description: 'Nombre del activo.',
    example: 'Grupo Financiero Galicia',
  })
  name: string;

  @ApiProperty({
    description: 'Tipo de activo.',
    enum: InstrumentType,
    example: InstrumentType.ACCIONES,
  })
  type: InstrumentType;
}

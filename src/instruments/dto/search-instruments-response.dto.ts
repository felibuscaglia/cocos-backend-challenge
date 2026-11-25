import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto';
import { InstrumentDto } from './instrument.dto';

export class SearchInstrumentsResponseDto {
  @ApiProperty({ description: 'Activos de la página.', type: [InstrumentDto] })
  data: InstrumentDto[];

  @ApiProperty({ description: 'Datos de paginación.', type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

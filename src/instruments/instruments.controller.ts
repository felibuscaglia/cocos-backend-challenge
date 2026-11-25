import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchInstrumentsQueryDto, SearchInstrumentsResponseDto } from './dto';
import { InstrumentsService } from './instruments.service';

@ApiTags('Instruments')
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Búsqueda de activos' })
  search(
    @Query() query: SearchInstrumentsQueryDto,
  ): Promise<SearchInstrumentsResponseDto> {
    return this.instrumentsService.search(query);
  }
}

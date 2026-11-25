import { Injectable } from '@nestjs/common';
import { PaginationMetaDto } from '../common/dto';
import {
  InstrumentDto,
  SearchInstrumentsQueryDto,
  SearchInstrumentsResponseDto,
} from './dto';
import { InstrumentsRepository } from './instruments.repository';

@Injectable()
export class InstrumentsService {
  constructor(private readonly instrumentsRepository: InstrumentsRepository) {}

  async search({
    q,
    page,
    limit,
  }: SearchInstrumentsQueryDto): Promise<SearchInstrumentsResponseDto> {
    const query = q?.trim() ?? '';
    const offset = (page - 1) * limit;

    const { items, totalCount } = query
      ? await this.instrumentsRepository.search(query, offset, limit)
      : await this.instrumentsRepository.findAll(offset, limit);

    return {
      data: items,
      meta: PaginationMetaDto.from(page, limit, totalCount),
    };
  }
}

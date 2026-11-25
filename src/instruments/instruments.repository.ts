import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult } from '../common/interfaces';
import { Instrument } from './instrument.entity';

@Injectable()
export class InstrumentsRepository {
  constructor(
    @InjectRepository(Instrument)
    private readonly repository: Repository<Instrument>,
  ) {}

  async findAll(
    offset: number,
    limit: number,
  ): Promise<PaginatedResult<Instrument>> {
    const [items, totalCount] = await this.repository.findAndCount({
      order: { ticker: 'ASC' },
      skip: offset,
      take: limit,
    });
    return { items, totalCount };
  }

  async search(
    query: string,
    offset: number,
    limit: number,
  ): Promise<PaginatedResult<Instrument>> {
    // Sin escapar, % y _ actúan como comodines de ILIKE.
    const escaped = query.replace(/[\\%_]/g, '\\$&');

    const [items, totalCount] = await this.repository
      .createQueryBuilder('instrument')
      .where(
        `unaccent(instrument.ticker) ILIKE unaccent(:contains) ESCAPE '\\'
         OR unaccent(instrument.name) ILIKE unaccent(:contains) ESCAPE '\\'`,
      )
      .addSelect(
        `CASE
           WHEN unaccent(instrument.ticker) ILIKE unaccent(:exact) ESCAPE '\\' THEN 0
           WHEN unaccent(instrument.ticker) ILIKE unaccent(:prefix) ESCAPE '\\' THEN 1
           WHEN unaccent(instrument.name) ILIKE unaccent(:prefix) ESCAPE '\\' THEN 2
           ELSE 3
         END`,
        'match_rank',
      )
      .setParameters({
        exact: escaped,
        prefix: `${escaped}%`,
        contains: `%${escaped}%`,
      })
      .orderBy('match_rank', 'ASC')
      .addOrderBy('instrument.ticker', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items, totalCount };
  }
}

import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Página actual.', example: 1 })
  page: number;

  @ApiProperty({
    description: 'Cantidad de resultados por página.',
    example: 20,
  })
  limit: number;

  @ApiProperty({ description: 'Total de resultados.', example: 66 })
  total: number;

  @ApiProperty({
    description: 'Total de páginas. Es 1 cuando no hay resultados.',
    example: 4,
  })
  totalPages: number;

  static from(page: number, limit: number, total: number): PaginationMetaDto {
    const meta = new PaginationMetaDto();
    meta.page = page;
    meta.limit = limit;
    meta.total = total;
    meta.totalPages = Math.max(1, Math.ceil(total / limit));
    return meta;
  }
}

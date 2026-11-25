import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SearchInstrumentsQueryDto {
  @ApiPropertyOptional({
    description: 'Texto a buscar en el ticker o en el nombre.',
    example: 'galicia',
  })
  @IsOptional()
  @IsString({ message: 'q debe ser un texto' })
  q?: string;

  @ApiPropertyOptional({
    description: 'Número de página.',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero' })
  @Min(1, { message: 'page debe ser mayor o igual a 1' })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de resultados por página.',
    minimum: 1,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser mayor o igual a 1' })
  limit: number = 20;
}

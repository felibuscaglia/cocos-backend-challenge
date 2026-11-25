import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ description: 'Código de estado HTTP.', example: 400 })
  statusCode: number;

  @ApiProperty({
    description:
      'Descripción del error. Es una lista cuando falla la validación de varios campos.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['size debe ser un entero positivo'],
  })
  message: string | string[];

  @ApiProperty({
    description: 'Nombre HTTP estándar del código de estado.',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({ description: 'Ruta del pedido.', example: '/orders' })
  path: string;

  @ApiProperty({
    description: 'Fecha y hora del error en formato ISO 8601.',
    example: '2026-11-24T15:30:00.000Z',
  })
  timestamp: string;
}

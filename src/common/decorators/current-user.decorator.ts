import {
  createParamDecorator,
  ExecutionContext,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiNotFoundResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto';
import {
  RequestWithUser,
  USER_ID_HEADER,
  USER_NOT_FOUND_MESSAGE,
  UserGuard,
} from '../guards';

const methodDecorators: MethodDecorator[] = [
  UseGuards(UserGuard),
  ApiHeader({
    name: USER_ID_HEADER,
    description: 'Id del usuario que hace el pedido.',
    required: true,
    example: '1',
  }),
  ApiNotFoundResponse({
    description: USER_NOT_FOUND_MESSAGE,
    type: ErrorResponseDto,
    example: {
      statusCode: 404,
      message: USER_NOT_FOUND_MESSAGE,
      error: 'Not Found',
      path: '/portfolio',
      timestamp: '2026-11-24T15:30:00.000Z',
    },
  }),
];

/**
 * Inyecta el usuario identificado por el header `X-User-Id`. Aplica `UserGuard`
 * y documenta el header y la respuesta 404 en Swagger. El módulo del controller
 * debe importar `UsersModule`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
  [
    (target, key) => {
      if (!key) return;
      const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
      methodDecorators.forEach((decorator) =>
        decorator(target, key, descriptor),
      );
    },
  ],
);

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '../../users/user.entity';
import { UsersRepository } from '../../users/users.repository';

export const USER_ID_HEADER = 'X-User-Id';
export const USER_NOT_FOUND_MESSAGE = 'Usuario no encontrado';

export type RequestWithUser = Request & { user: User };

@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly usersRepository: UsersRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.header(USER_ID_HEADER)?.trim();

    // Sin este chequeo, TypeORM ignora un id undefined y devuelve el primer usuario.
    if (!userId) throw new NotFoundException(USER_NOT_FOUND_MESSAGE);

    const user = await this.usersRepository.findById(Number(userId));
    if (!user) throw new NotFoundException(USER_NOT_FOUND_MESSAGE);

    request.user = user;
    return true;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly repository: Repository<User>,
  ) {}

  findById(id: number): Promise<User | null> {
    return this.repository.findOneBy({ id });
  }

  // SELECT ... FOR UPDATE: TypeORM exige una transacción en curso y falla si no la hay.
  async lockById(id: number): Promise<void> {
    await this.repository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }
}

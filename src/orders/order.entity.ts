import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Instrument } from '../instruments/instrument.entity';
import { User } from '../users/user.entity';
import { OrderSide, OrderStatus, OrderType } from './enums';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid', type: 'int', nullable: true })
  instrumentId: number | null;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrumentid' })
  instrument: Instrument;

  @Column({ name: 'userid', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userid' })
  user: User;

  @Column({ type: 'int', nullable: true })
  size: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  type: OrderType | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  side: OrderSide | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  status: OrderStatus | null;

  @Column({ type: 'timestamp', nullable: true })
  datetime: Date | null;
}

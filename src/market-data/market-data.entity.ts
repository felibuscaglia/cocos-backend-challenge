import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Instrument } from '../instruments/instrument.entity';

@Entity('marketdata')
export class MarketData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid', type: 'int', nullable: true })
  instrumentId: number | null;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrumentid' })
  instrument: Instrument;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  high: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  low: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  open: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  close: string | null;

  @Column({
    name: 'previousclose',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  previousClose: string | null;

  @Column({ type: 'date', nullable: true })
  date: string | null;
}

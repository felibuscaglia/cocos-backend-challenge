import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InstrumentType } from './enums';

@Entity('instruments')
export class Instrument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10, nullable: false })
  ticker: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 10, nullable: false })
  type: InstrumentType;
}

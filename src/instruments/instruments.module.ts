import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from './instrument.entity';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsRepository } from './instruments.repository';
import { InstrumentsService } from './instruments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument])],
  controllers: [InstrumentsController],
  providers: [InstrumentsRepository, InstrumentsService],
  exports: [InstrumentsRepository],
})
export class InstrumentsModule {}

import { Instrument } from '../instrument.entity';

export interface InstrumentWithLatestClose {
  instrument: Instrument;
  latestClose: string | null;
}

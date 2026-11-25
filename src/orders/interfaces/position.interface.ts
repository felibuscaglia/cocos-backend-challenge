// Los NUMERIC llegan como texto desde Postgres.
export interface Position {
  ticker: string;
  name: string;
  quantity: string;
  ppc: string | null;
  latestPrice: string | null;
  marketValue: string | null;
  totalReturn: string | null;
}

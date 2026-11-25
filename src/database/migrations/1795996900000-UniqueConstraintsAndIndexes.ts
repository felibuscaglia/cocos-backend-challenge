import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueConstraintsAndIndexes1795996900000 implements MigrationInterface {
  name = 'UniqueConstraintsAndIndexes1795996900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE instruments
        ADD CONSTRAINT instruments_ticker_key UNIQUE (ticker)
    `);
    await queryRunner.query(`
      ALTER TABLE marketdata
        ADD CONSTRAINT marketdata_instrumentid_date_key UNIQUE (instrumentid, date)
    `);
    await queryRunner.query(`
      CREATE INDEX orders_userid_status_instrumentid_idx
        ON orders (userid, status, instrumentid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX orders_userid_status_instrumentid_idx`);
    await queryRunner.query(`
      ALTER TABLE marketdata
        DROP CONSTRAINT marketdata_instrumentid_date_key
    `);
    await queryRunner.query(`
      ALTER TABLE instruments
        DROP CONSTRAINT instruments_ticker_key
    `);
  }
}

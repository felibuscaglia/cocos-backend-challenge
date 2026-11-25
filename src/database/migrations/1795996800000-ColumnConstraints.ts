import { MigrationInterface, QueryRunner } from 'typeorm';

export class ColumnConstraints1795996800000 implements MigrationInterface {
  name = 'ColumnConstraints1795996800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ALTER COLUMN email SET NOT NULL,
        ALTER COLUMN accountnumber SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE instruments
        ALTER COLUMN ticker SET NOT NULL,
        ALTER COLUMN name SET NOT NULL,
        ALTER COLUMN type SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ALTER COLUMN instrumentid SET NOT NULL,
        ALTER COLUMN userid SET NOT NULL,
        ALTER COLUMN side SET NOT NULL,
        ALTER COLUMN type SET NOT NULL,
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN size SET NOT NULL,
        ALTER COLUMN price SET NOT NULL,
        ALTER COLUMN datetime SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketdata
        ALTER COLUMN instrumentid SET NOT NULL,
        ALTER COLUMN date SET NOT NULL,
        ALTER COLUMN close SET NOT NULL,
        ALTER COLUMN previousclose SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE instruments
        ADD CONSTRAINT instruments_type_check
          CHECK (type IN ('ACCIONES', 'MONEDA'))
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD CONSTRAINT orders_side_check
          CHECK (side IN ('BUY', 'SELL', 'CASH_IN', 'CASH_OUT')),
        ADD CONSTRAINT orders_type_check
          CHECK (type IN ('MARKET', 'LIMIT')),
        ADD CONSTRAINT orders_status_check
          CHECK (status IN ('NEW', 'FILLED', 'REJECTED', 'CANCELLED'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
        DROP CONSTRAINT orders_side_check,
        DROP CONSTRAINT orders_type_check,
        DROP CONSTRAINT orders_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE instruments
        DROP CONSTRAINT instruments_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE marketdata
        ALTER COLUMN instrumentid DROP NOT NULL,
        ALTER COLUMN date DROP NOT NULL,
        ALTER COLUMN close DROP NOT NULL,
        ALTER COLUMN previousclose DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ALTER COLUMN instrumentid DROP NOT NULL,
        ALTER COLUMN userid DROP NOT NULL,
        ALTER COLUMN side DROP NOT NULL,
        ALTER COLUMN type DROP NOT NULL,
        ALTER COLUMN status DROP NOT NULL,
        ALTER COLUMN size DROP NOT NULL,
        ALTER COLUMN price DROP NOT NULL,
        ALTER COLUMN datetime DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE instruments
        ALTER COLUMN ticker DROP NOT NULL,
        ALTER COLUMN name DROP NOT NULL,
        ALTER COLUMN type DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE users
        ALTER COLUMN email DROP NOT NULL,
        ALTER COLUMN accountnumber DROP NOT NULL
    `);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPositionsFunction1795997100000 implements MigrationInterface {
  name = 'UserPositionsFunction1795997100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El PPC depende del orden de las operaciones, por eso se recorre con un loop
    // en lugar de agregarse con SUM. Ver docs/decisiones/portfolio.md.
    await queryRunner.query(`
      CREATE FUNCTION user_positions(p_user_id INT)
      RETURNS TABLE (
        instrument_id INT,
        ticker VARCHAR,
        name VARCHAR,
        quantity NUMERIC,
        ppc NUMERIC,
        latest_price NUMERIC,
        market_value NUMERIC,
        total_return NUMERIC
      )
      LANGUAGE plpgsql
      STABLE
      AS $$
      DECLARE
        v_instrument_id INT;
        v_order RECORD;
        v_quantity NUMERIC;
        v_ppc NUMERIC;
      BEGIN
        FOR v_instrument_id IN
          SELECT DISTINCT o.instrumentid
          FROM orders o
          WHERE o.userid = p_user_id
            AND o.status = 'FILLED'
            AND o.side IN ('BUY', 'SELL')
        LOOP
          v_quantity := 0;
          v_ppc := NULL;

          FOR v_order IN
            SELECT o.side, o.size, o.price
            FROM orders o
            WHERE o.userid = p_user_id
              AND o.instrumentid = v_instrument_id
              AND o.status = 'FILLED'
              AND o.side IN ('BUY', 'SELL')
            ORDER BY o.datetime, o.id
          LOOP
            IF v_order.side = 'BUY' THEN
              IF v_quantity <= 0 THEN
                v_ppc := v_order.price;
              ELSE
                v_ppc := (v_quantity * v_ppc + v_order.size * v_order.price)
                         / (v_quantity + v_order.size);
              END IF;
              v_quantity := v_quantity + v_order.size;
            ELSE
              v_quantity := v_quantity - v_order.size;
            END IF;
          END LOOP;

          IF v_quantity <> 0 THEN
            RETURN QUERY
              SELECT
                i.id,
                i.ticker,
                i.name,
                v_quantity,
                v_ppc,
                md.close,
                v_quantity * md.close,
                (md.close - v_ppc) / NULLIF(v_ppc, 0)
              FROM instruments i
              LEFT JOIN LATERAL (
                SELECT m.close
                FROM marketdata m
                WHERE m.instrumentid = i.id
                ORDER BY m.date DESC
                LIMIT 1
              ) md ON TRUE
              WHERE i.id = v_instrument_id;
          END IF;
        END LOOP;
      END;
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION user_positions(INT)`);
  }
}

import type { MigrationInterface, QueryRunner } from "typeorm";

export class Init1758468149957 implements MigrationInterface {
    name = 'Init1758468149957'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payment_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" numeric(10,2) NOT NULL, "currency" character varying(10) NOT NULL, "provider" character varying(50) NOT NULL, "status" character varying(20) NOT NULL, "externalTransactionId" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "companyId" uuid NOT NULL, "planId" uuid, CONSTRAINT "PK_d32b3c6b0d2c1d22604cbcc8c49" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "company_subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "price" numeric(10,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "companyId" uuid NOT NULL, "planId" uuid NOT NULL, "paymentTransactionId" uuid, CONSTRAINT "REL_75684a029e7f282ad05aae67e0" UNIQUE ("paymentTransactionId"), CONSTRAINT "PK_2dad37af4a389c2878c9b67a050" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_98ac11a46865dc0819a9eea8330" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_66ad7ef110991224c43791a6ae7" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_subscriptions" ADD CONSTRAINT "FK_cae9d2297645c98f23978e1e9c1" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_subscriptions" ADD CONSTRAINT "FK_59f9ad2eeec93dbe15d3694317f" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_subscriptions" ADD CONSTRAINT "FK_75684a029e7f282ad05aae67e06" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "company_subscriptions" DROP CONSTRAINT "FK_75684a029e7f282ad05aae67e06"`);
        await queryRunner.query(`ALTER TABLE "company_subscriptions" DROP CONSTRAINT "FK_59f9ad2eeec93dbe15d3694317f"`);
        await queryRunner.query(`ALTER TABLE "company_subscriptions" DROP CONSTRAINT "FK_cae9d2297645c98f23978e1e9c1"`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_66ad7ef110991224c43791a6ae7"`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_98ac11a46865dc0819a9eea8330"`);
        await queryRunner.query(`DROP TABLE "company_subscriptions"`);
        await queryRunner.query(`DROP TABLE "payment_transactions"`);
    }

}

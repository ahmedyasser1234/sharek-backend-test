import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

import { Company } from './src/company/entities/company.entity';
import { CompanyToken } from './src/company/auth/entities/company-token.entity';
import { CompanyLoginLog } from './src/company/auth/entities/company-login-log.entity';
import { CompanySubscription } from './src/subscription/entities/company-subscription.entity';
import { Employee } from './src/employee/entities/employee.entity';
import { EmployeeCard } from './src/employee/entities/employee-card.entity';
import { Plan } from './src/plan/entities/plan.entity';
import { EmployeeImage } from './src/employee/entities/EmployeeImage.entity';
import { Visit } from './src/employee/entities/visit.entity';
import { PaymentTransaction } from './src/payment/entities/payment-transaction.entity';


export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    Company,
    CompanyToken,
    CompanyLoginLog,
    CompanySubscription,
    Employee,
    EmployeeCard,
    Plan,
    EmployeeImage,
    Visit,
    PaymentTransaction,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: true,
  ssl: true,
  extra: {
    ssl: {
      rejectUnauthorized: false,
    },
  },
});


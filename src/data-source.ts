import { DataSource } from 'typeorm';
import { Company } from './company/entities/company.entity';
import { CompanyToken } from './company/auth/entities/company-token.entity';
import { CompanyLoginLog } from './company/auth/entities/company-login-log.entity';
import { CompanySubscription } from './subscription/entities/company-subscription.entity';
import { Employee } from './employee/entities/employee.entity';
import { EmployeeCard } from './employee/entities/employee-card.entity';
import { Plan } from './plan/entities/plan.entity';
import { EmployeeImage } from './employee/entities/EmployeeImage.entity';
import { Visit } from './employee/entities/visit.entity';
import { PaymentTransaction } from './payment/entities/payment-transaction.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Ahmed123',
  database: 'company_db',
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
  synchronize: false,
});

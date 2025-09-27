import { DataSource } from 'typeorm';
import { Company } from './src/company/entities/company.entity';
import { CompanyToken } from './src/company/auth/entities/company-token.entity';
import { CompanyLoginLog } from './src/company/auth/entities/company-login-log.entity';
import { CompanySubscription } from './src/subscription/entities/company-subscription.entity';
import { Employee } from './src/employee/entities/employee.entity';
import { EmployeeCard } from './src/employee/entities/employee-card.entity';
import { Plan } from './src/plan/entities/plan.entity';
import { EmployeeImage } from './src/employee/entities/EmployeeImage.entity';
import { Visit } from './src/employee/entities/visit.entity';
import { PaymentTransaction } from './src/payment/entities/PaymentTransaction';

export default new DataSource({
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

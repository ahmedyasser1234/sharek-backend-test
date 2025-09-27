import { DataSource } from 'typeorm'; 
import { config } from 'dotenv'; 
config(); 
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

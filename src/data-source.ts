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
import { Admin } from './admin/entities/admin.entity'; 
import { PaymentProof } from './payment/entities/payment-proof.entity';
import { AdminToken } from './admin/auth/entities/admin-token.entity';
import { CompanyActivity } from './company/entities/company-activity.entity'; 
import { Manager } from './admin/entities/manager.entity'; 
import { ManagerToken } from './admin/entities/manager-token.entity';

export const AppDataSource = new DataSource({
type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false,
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
    Admin,
    PaymentProof,
    AdminToken,
    CompanyActivity,
    Manager, 
    ManagerToken, 
  ],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
});
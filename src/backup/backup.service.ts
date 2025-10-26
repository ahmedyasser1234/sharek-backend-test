// backup.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// كل الـ entities بتاعتك
import { Company } from '../company/entities/company.entity';
import { CompanyToken } from '../company/auth/entities/company-token.entity';
import { CompanyLoginLog } from '../company/auth/entities/company-login-log.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Employee } from '../employee/entities/employee.entity';
import { EmployeeCard } from '../employee/entities/employee-card.entity';
import { Plan } from '../plan/entities/plan.entity';
import { EmployeeImage } from '../employee/entities/EmployeeImage.entity';
import { Visit } from '../employee/entities/visit.entity';
import { PaymentTransaction } from '../payment/entities/payment-transaction.entity';
import { Admin } from '../admin/entities/admin.entity';
import { PaymentProof } from '../payment/entities/payment-proof.entity';

const execPromise = promisify(exec);

interface DatabaseRow {
  [key: string]: string | number | boolean | Date | null | undefined;
}

@Injectable()
export class BackupService {
  constructor(
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
    
    @InjectRepository(CompanyToken)
    private companyTokenRepo: Repository<CompanyToken>,
    
    @InjectRepository(CompanyLoginLog)
    private companyLoginLogRepo: Repository<CompanyLoginLog>,
    
    @InjectRepository(CompanySubscription)
    private companySubscriptionRepo: Repository<CompanySubscription>,
    
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    
    @InjectRepository(EmployeeCard)
    private employeeCardRepo: Repository<EmployeeCard>,
    
    @InjectRepository(Plan)
    private planRepo: Repository<Plan>,
    
    @InjectRepository(EmployeeImage)
    private employeeImageRepo: Repository<EmployeeImage>,
    
    @InjectRepository(Visit)
    private visitRepo: Repository<Visit>,
    
    @InjectRepository(PaymentTransaction)
    private paymentTransactionRepo: Repository<PaymentTransaction>,
    
    @InjectRepository(Admin)
    private adminRepo: Repository<Admin>,
    
    @InjectRepository(PaymentProof)
    private paymentProofRepo: Repository<PaymentProof>,
  ) {}

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_${timestamp}.sql`;
    const backupPath = path.join(process.cwd(), 'backups', backupFileName);

    // إنشاء مجلد backups إذا لم يكن موجوداً
    const backupsDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    let backupContent = `-- Database Backup\n`;
    backupContent += `-- Generated: ${new Date().toISOString()}\n`;
    backupContent += `-- Database: ${process.env.DB_NAME}\n\n`;

    // Backup لكل table على حدة
    backupContent += await this.backupTable('company', this.companyRepo);
    backupContent += await this.backupTable('company_token', this.companyTokenRepo);
    backupContent += await this.backupTable('company_login_log', this.companyLoginLogRepo);
    backupContent += await this.backupTable('company_subscription', this.companySubscriptionRepo);
    backupContent += await this.backupTable('employee', this.employeeRepo);
    backupContent += await this.backupTable('employee_card', this.employeeCardRepo);
    backupContent += await this.backupTable('plan', this.planRepo);
    backupContent += await this.backupTable('employee_image', this.employeeImageRepo);
    backupContent += await this.backupTable('visit', this.visitRepo);
    backupContent += await this.backupTable('payment_transaction', this.paymentTransactionRepo);
    backupContent += await this.backupTable('admin', this.adminRepo);
    backupContent += await this.backupTable('payment_proof', this.paymentProofRepo);

    // حفظ الملف
    fs.writeFileSync(backupPath, backupContent);
    return backupPath;
  }

  private async backupTable(tableName: string, repository: Repository<any>): Promise<string> {
    let tableContent = '';
    
    try {
      const data = await repository.find();
      
      if (data.length > 0) {
        tableContent += `-- Table: ${tableName}\n`;
        tableContent += `-- Records: ${data.length}\n`;
        
        for (const row of data) {
          const columns = Object.keys(row as DatabaseRow).map(col => `"${col}"`).join(', ');
          const values = Object.values(row as DatabaseRow).map(val => {
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val)}'`;
            return val.toString();
          }).join(', ');
          
          tableContent += `INSERT INTO "${tableName}" (${columns}) VALUES (${values});\n`;
        }
        tableContent += '\n';
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      tableContent += `-- Error backing up table ${tableName}: ${errorMessage}\n\n`;
    }
    
    return tableContent;
  }

  // طريقة بديلة باستخدام pg_dump (أفضل للأداء)
  async createPgDumpBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_pgdump_${timestamp}.sql`;
    const backupPath = path.join(process.cwd(), 'backups', backupFileName);

    const backupsDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const command = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump \
      -h ${process.env.DB_HOST} \
      -p ${process.env.DB_PORT} \
      -U ${process.env.DB_USERNAME} \
      -d ${process.env.DB_NAME} \
      --inserts \
      --column-inserts \
      -f ${backupPath}`;

    try {
      await execPromise(command);
      return backupPath;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PG_DUMP Backup failed: ${errorMessage}`);
    }
  }

  // دالة لمعرفة حجم البيانات
  async getDatabaseStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    
    stats['company'] = await this.companyRepo.count();
    stats['company_token'] = await this.companyTokenRepo.count();
    stats['company_login_log'] = await this.companyLoginLogRepo.count();
    stats['company_subscription'] = await this.companySubscriptionRepo.count();
    stats['employee'] = await this.employeeRepo.count();
    stats['employee_card'] = await this.employeeCardRepo.count();
    stats['plan'] = await this.planRepo.count();
    stats['employee_image'] = await this.employeeImageRepo.count();
    stats['visit'] = await this.visitRepo.count();
    stats['payment_transaction'] = await this.paymentTransactionRepo.count();
    stats['admin'] = await this.adminRepo.count();
    stats['payment_proof'] = await this.paymentProofRepo.count();
    
    return stats;
  }
}
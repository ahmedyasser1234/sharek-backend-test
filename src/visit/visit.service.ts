import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visit } from '../employee/entities/visit.entity';
import { Employee } from '../employee/entities/employee.entity';
import { UAParser } from 'ua-parser-js';
import { Request } from 'express';

export interface DailyVisit {
  day: string;
  count: number;
}

export interface DeviceStat {
  deviceType: string;
  count: number;
}

@Injectable()
export class VisitService {
  private readonly logger = new Logger(VisitService.name);

  constructor(
    @InjectRepository(Visit)
    private readonly visitRepo: Repository<Visit>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async logVisit(employee: Employee, source: string = 'link', req?: Request): Promise<void> {
    this.logger.log(`🚀 logVisit() بدأ التنفيذ`);
    const ua = req?.headers['user-agent'] || '';
    const parser = UAParser(ua);

    const os = parser.os.name || 'unknown';
    const browser = parser.browser.name || 'unknown';
    const deviceType = parser.device.type || 'desktop';
    const ipAddress = req?.ip || (req?.headers['x-forwarded-for'] as string) || '';

    this.logger.log(`📥 محاولة تسجيل زيارة للموظف ${employee.id} من المصدر: ${source}`);
    this.logger.debug(`🖥️ الجهاز: ${deviceType} | OS: ${os} | Browser: ${browser} | IP: ${ipAddress}`);

    const recentVisit = await this.visitRepo.findOne({
      where: {
        employee: { id: employee.id },
        source,
        os,
        browser,
        deviceType,
        ipAddress,
      },
      order: { visitedAt: 'DESC' },
    });

const lastVisit = recentVisit?.visitedAt ? recentVisit.visitedAt.toISOString() : 'لا يوجد';
this.logger.debug(`🔍 آخر زيارة مشابهة: ${lastVisit}`);

    if (recentVisit) {
      const diff = Date.now() - new Date(recentVisit.visitedAt).getTime();
      this.logger.debug(`⏱️ الفرق الزمني: ${diff}ms`);
      if (diff < 60000) {
        this.logger.warn(`⛔ تم تجاهل زيارة مكررة خلال أقل من دقيقة للموظف ${employee.id}`);
        return;
      }
    }

    const visit = this.visitRepo.create({
      employee: { id: employee.id },
      source,
      os,
      browser,
      deviceType,
      ipAddress,
    });

    await this.visitRepo.save(visit);
    this.logger.log(`✅ تم حفظ الزيارة للموظف ${employee.id}`);
  }

  async logVisitById(body: {
    employeeId: number;
    source?: string;
    os?: string;
    browser?: string;
    deviceType?: string;
    ipAddress?: string;
  }): Promise<void> {
    this.logger.log(`🚀 logVisitById() بدأ التنفيذ`);
    const employee = await this.employeeRepo.findOne({ where: { id: body.employeeId } });
    if (!employee) throw new NotFoundException('الموظف غير موجود');

    this.logger.log(`📥 محاولة تسجيل زيارة من البطاقة للموظف ${employee.id}`);
    this.logger.debug(`🖥️ الجهاز: ${body.deviceType} | OS: ${body.os} | Browser: ${body.browser} | IP: ${body.ipAddress}`);

    const recentVisit = await this.visitRepo.findOne({
      where: {
        employee: { id: employee.id },
        source: body.source || 'link',
        os: body.os || 'unknown',
        browser: body.browser || 'unknown',
        deviceType: body.deviceType || 'desktop',
        ipAddress: body.ipAddress || '',
      },
      order: { visitedAt: 'DESC' },
    });

const lastVisit = recentVisit?.visitedAt ? recentVisit.visitedAt.toISOString() : 'لا يوجد';
this.logger.debug(`🔍 آخر زيارة مشابهة: ${lastVisit}`);

    if (recentVisit) {
      const diff = Date.now() - new Date(recentVisit.visitedAt).getTime();
      this.logger.debug(`⏱️ الفرق الزمني: ${diff}ms`);
      if (diff < 60000) {
        this.logger.warn(`⛔ تم تجاهل زيارة مكررة خلال أقل من دقيقة للموظف ${employee.id}`);
        return;
      }
    }

    const visit = this.visitRepo.create({
      employee: { id: employee.id },
      source: body.source || 'link',
      os: body.os || 'unknown',
      browser: body.browser || 'unknown',
      deviceType: body.deviceType || 'desktop',
      ipAddress: body.ipAddress || '',
    });

    await this.visitRepo.save(visit);
    this.logger.log(`✅ تم حفظ زيارة من البطاقة للموظف ${employee.id}`);
  }

  async getVisitCount(employeeId: number): Promise<number> {
    this.logger.log(`🚀 getVisitCount() بدأ التنفيذ`);
    this.logger.debug(`📊 جلب عدد الزيارات للموظف: ${employeeId}`);

    const count = await this.visitRepo
      .createQueryBuilder('visit')
      .where('"employeeId" = :employeeId', { employeeId })
      .getCount();

    this.logger.log(`✅ عدد الزيارات: ${count}`);
    return count;
  }

 
    async getDailyVisits(employeeId: number): Promise<{ day: string; count: number }[]> {
    const result: { day: string; count: number }[] = await this.visitRepo.query(`
      SELECT DATE("visitedAt") as day, COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY day
      ORDER BY day DESC
    `, [employeeId]);

    this.logger.log(`✅ تم استخراج ${result.length} يوم من البيانات`);
    return result;
  }

  async getDeviceStats(employeeId: number): Promise<{ deviceType: string; count: number }[]> {
    const result: { deviceType: string; count: number }[] = await this.visitRepo.query(`
      SELECT "deviceType", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "deviceType"
    `, [employeeId]);

    this.logger.log(`✅ تم استخراج إحصائيات الأجهزة (${result.length} نوع)`);
    return result;
  }

  async getAllForCompany(companyId: string): Promise<Visit[]> {
    this.logger.log(`🚀 getAllForCompany() بدأ التنفيذ`);
    this.logger.debug(`📊 جلب كل الزيارات للشركة: ${companyId}`);
    return this.visitRepo.find({
      where: { employee: { company: { id: companyId } } },
      relations: ['employee'],
      order: { visitedAt: 'DESC' },
    });
  }

  async getEmployeeById(id: number): Promise<Employee> {
    this.logger.log(`🚀 getEmployeeById() بدأ التنفيذ`);
    const employee = await this.employeeRepo.findOne({ where: { id } });
    if (!employee) {
      this.logger.warn(`❌ الموظف غير موجود: ${id}`);
      throw new NotFoundException('الموظف غير موجود');
    }
    this.logger.log(`✅ تم العثور على الموظف: ${employee.id}`);
    return employee;
  }
}

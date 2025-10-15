import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visit } from '../employee/entities/visit.entity';
import { Employee } from '../employee/entities/employee.entity';
import { UAParser } from 'ua-parser-js';
import { Request } from 'express';
import axios from 'axios';

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
  constructor(
    @InjectRepository(Visit)
    private readonly visitRepo: Repository<Visit>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  private async getCountryFromIP(ip: string): Promise<string> {
    try {
      const response = await axios.get<string>(`https://ipapi.co/${ip}/country_name/`);
      return typeof response.data === 'string' ? response.data : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async logVisit(employee: Employee, source: string = 'link', req?: Request): Promise<void> {
    try {
      const ua = req?.headers['user-agent'] || '';
      const parser = UAParser(ua);

      const os = parser.os.name || 'unknown';
      const browser = parser.browser.name || 'unknown';
      const deviceType = parser.device.type || 'desktop';
      const ipAddress = req?.ip || (req?.headers['x-forwarded-for'] as string) || '';
      const country = await this.getCountryFromIP(ipAddress);

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

      if (recentVisit) {
        const diff = Date.now() - new Date(recentVisit.visitedAt).getTime();
        if (diff < 60000) return;
      }

      const visit = this.visitRepo.create({
        employee: { id: employee.id },
        source,
        os,
        browser,
        deviceType,
        ipAddress,
        country,
      });

      await this.visitRepo.save(visit);
    } catch {
      throw new HttpException('فشل تسجيل الزيارة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async logVisitById(body: {
    employeeId: number;
    source?: string;
    os?: string;
    browser?: string;
    deviceType?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const employee = await this.employeeRepo.findOne({ where: { id: body.employeeId } });
      if (!employee) throw new NotFoundException('الموظف غير موجود');

      await this.logVisit(employee, body.source || 'link', {
        headers: { 'user-agent': body.os || '' },
        ip: body.ipAddress,
      } as Request);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل تسجيل الزيارة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getVisitCount(employeeId: number): Promise<number> {
    try {
      return await this.visitRepo
        .createQueryBuilder('visit')
        .where('"employeeId" = :employeeId', { employeeId })
        .getCount();
    } catch {
      throw new HttpException('فشل جلب عدد الزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getDailyVisits(employeeId: number): Promise<DailyVisit[]> {
    try {
      return await this.visitRepo.query(`
        SELECT DATE("visitedAt") as day, COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY day
        ORDER BY day DESC
      `, [employeeId]);
    } catch {
      throw new HttpException('فشل جلب الزيارات اليومية', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getDeviceStats(employeeId: number): Promise<DeviceStat[]> {
    try {
      return await this.visitRepo.query(`
        SELECT "deviceType", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "deviceType"
      `, [employeeId]);
    } catch {
      throw new HttpException('فشل جلب إحصائيات الأجهزة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getBrowserStats(employeeId: number): Promise<{ browser: string; count: number }[]> {
    try {
      return await this.visitRepo.query(`
        SELECT "browser", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "browser"
        ORDER BY count DESC
      `, [employeeId]);
    } catch {
      throw new HttpException('فشل جلب إحصائيات المتصفحات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getOSStats(employeeId: number): Promise<{ os: string; count: number }[]> {
    try {
      return await this.visitRepo.query(`
        SELECT "os", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "os"
        ORDER BY count DESC
      `, [employeeId]);
    } catch {
      throw new HttpException('فشل جلب إحصائيات أنظمة التشغيل', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getSourceStats(employeeId: number): Promise<{ source: string; count: number }[]> {
    try {
      return await this.visitRepo.query(`
        SELECT "source", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "source"
        ORDER BY count DESC
      `, [employeeId]);
    } catch {
      throw new HttpException('فشل جلب إحصائيات المصدر', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getCountryStats(employeeId: number): Promise<{ country: string; count: number }[]> {
    try {
      return await this.visitRepo.query(`
        SELECT "country", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "country"
        ORDER BY count DESC
      `, [employeeId]);
    } catch {
      throw new HttpException('فشل جلب إحصائيات الدول', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllForCompany(companyId: string): Promise<Visit[]> {
    try {
      return await this.visitRepo.find({
        where: { employee: { company: { id: companyId } } },
        relations: ['employee'],
        order: { visitedAt: 'DESC' },
      });
    } catch {
      throw new HttpException('فشل جلب كل الزيارات للشركة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getEmployeeById(id: number): Promise<Employee> {
    try {
      const employee = await this.employeeRepo.findOne({ where: { id } });
      if (!employee) throw new NotFoundException('الموظف غير موجود');
      return employee;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل جلب بيانات الموظف', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

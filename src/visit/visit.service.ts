import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
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
  private readonly logger = new Logger(VisitService.name);

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

      const ipAddress =
        typeof req?.ip === 'string' && req.ip !== '' ? req.ip :
        typeof req?.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] :
        'unknown';

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
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error && typeof error.message === 'string'
          ? error.message
          : 'Unknown error';
      this.logger.error(`فشل تسجيل الزيارة: ${errMsg}`);
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

      const source = body.source || 'link';
      const os = body.os || 'unknown';
      const browser = body.browser || 'unknown';
      const deviceType = body.deviceType || 'desktop';
      const ipAddress = body.ipAddress || 'unknown';
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
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل تسجيل الزيارة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getVisitCount(employeeId: number): Promise<number> {
    return this.visitRepo
      .createQueryBuilder('visit')
      .where('"employeeId" = :employeeId', { employeeId })
      .getCount();
  }

  async getDailyVisits(employeeId: number): Promise<DailyVisit[]> {
    return this.visitRepo.query(
      `
      SELECT DATE("visitedAt") as day, COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY day
      ORDER BY day DESC
    `,
      [employeeId],
    );
  }

  async getDeviceStats(employeeId: number): Promise<DeviceStat[]> {
    return this.visitRepo.query(
      `
      SELECT "deviceType", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "deviceType"
    `,
      [employeeId],
    );
  }

  async getBrowserStats(employeeId: number): Promise<{ browser: string; count: number }[]> {
    return this.visitRepo.query(
      `
      SELECT "browser", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "browser"
      ORDER BY count DESC
    `,
      [employeeId],
    );
  }

  async getOSStats(employeeId: number): Promise<{ os: string; count: number }[]> {
    return this.visitRepo.query(
      `
      SELECT "os", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "os"
      ORDER BY count DESC
    `,
      [employeeId],
    );
  }

  async getSourceStats(employeeId: number): Promise<{ source: string; count: number }[]> {
    return this.visitRepo.query(
      `
      SELECT "source", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "source"
      ORDER BY count DESC
    `,
      [employeeId],
    );
  }

  async getCountryStats(employeeId: number): Promise<{ country: string; count: number }[]> {
    return this.visitRepo.query(
      `
      SELECT "country", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "country"
      ORDER BY count DESC
    `,
      [employeeId],
    );
  }

  async getAllForCompany(companyId: string): Promise<Visit[]> {
    return this.visitRepo.find({
      where: { employee: { company: { id: companyId } } },
      relations: ['employee'],
      order: { visitedAt: 'DESC' },
    });
  }

  async getEmployeeById(id: number): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({ where: { id } });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }
}
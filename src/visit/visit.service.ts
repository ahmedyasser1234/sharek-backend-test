import {
  Injectable,
  NotFoundException,
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

interface IpApiResponse {
  status: string;
  country?: string;
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
      // تحسين التعامل مع IP المحلي
      if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || 
          ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.') ||
          ip === '::ffff:127.0.0.1') {
        return 'localhost';
      }

      // تنظيف IP
      const cleanIP = ip.replace(/^::ffff:/, '');

      // محاولة مع خدمة ipapi.co أولاً
      try {
        const response = await axios.get<string>(`http://ipapi.co/${cleanIP}/country_name/`, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.data && typeof response.data === 'string' && response.data !== 'Undefined') {
          const country = response.data.trim();
          if (country && country !== 'Undefined' && country !== 'undefined') {
            return country;
          }
        }
      } catch (ipapiError) {
        this.logger.warn(`فشل في ipapi.co لـ IP ${cleanIP}: ${ipapiError}`);
      }

      // محاولة بديلة مع ip-api.com
      try {
        const response = await axios.get<IpApiResponse>(`http://ip-api.com/json/${cleanIP}`, {
          timeout: 5000
        });
        
        if (response.data && response.data.status === 'success' && response.data.country) {
          return response.data.country;
        }
      } catch (ipApiError) {
        this.logger.warn(`فشل في ip-api.com لـ IP ${cleanIP}: ${ipApiError}`);
      }

      // محاولة ثالثة مع ipinfo.io
      try {
        const response = await axios.get<string>(`https://ipinfo.io/${cleanIP}/country`, {
          timeout: 5000,
          headers: {
            'Authorization': `Bearer ${process.env.IPINFO_TOKEN || ''}`
          }
        });
        
        if (response.data && typeof response.data === 'string') {
          const country = response.data.trim();
          if (country && country !== 'Undefined') {
            return country;
          }
        }
      } catch (ipinfoError) {
        this.logger.warn(`فشل في ipinfo.io لـ IP ${cleanIP}: ${ipinfoError}`);
      }

      return 'unknown';
    } catch (error) {
      this.logger.error(`خطأ عام في تحديد الدولة لـ IP ${ip}: ${error}`);
      return 'unknown';
    }
  }

  private extractIPFromRequest(req?: Request): string {
    try {
      let ip = 'unknown';
      
      if (req) {
        // التحقق من x-forwarded-for أولاً (للمواقع خلف proxy)
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (xForwardedFor) {
          if (Array.isArray(xForwardedFor)) {
            ip = xForwardedFor[0] || 'unknown';
          } else {
            ip = xForwardedFor.split(',')[0].trim();
          }
        }
        
        // إذا لم يتم العثور على IP في x-forwarded-for، جرب req.ip
        if (!ip || ip === 'unknown') {
          ip = req.ip || 'unknown';
        }
        
        // إذا لم ينجح ذلك، جرب connection.remoteAddress
        if (!ip || ip === 'unknown') {
          ip = req.connection?.remoteAddress || 'unknown';
        }
        
        // إذا لم ينجح ذلك، جرب socket.remoteAddress
        if (!ip || ip === 'unknown') {
          ip = req.socket?.remoteAddress || 'unknown';
        }
      }
      
      // تنظيف IP النهائي
      if (ip && ip !== 'unknown') {
        ip = ip.replace(/^::ffff:/, '');
        // إزالة البورت إذا كان موجوداً
        ip = ip.split(':')[0] || 'unknown';
      }
      
      return ip;
    } catch (error) {
      this.logger.error(`فشل استخراج IP من الطلب: ${error}`);
      return 'unknown';
    }
  }

  async logVisit(employee: Employee, source: string = 'link', req?: Request): Promise<void> {
  try {
    const ua = req?.headers['user-agent'] || '';
    const parser = new UAParser(ua);

    const os = parser.getOS().name || 'unknown';
    const browser = parser.getBrowser().name || 'unknown';
    const device = parser.getDevice();
    const deviceType = device.type || 'desktop';

    const ipAddress = this.extractIPFromRequest(req);

    let finalSource = source;
    if (req && req.query && req.query.source) {
      finalSource = req.query.source as string;
    }

    // الحصول على الدولة باستخدام await
    let country = 'unknown';
    try {
      country = await this.getCountryFromIP(ipAddress);
    } catch (error) {
      this.logger.error(`فشل الحصول على الدولة لـ IP ${ipAddress}: ${error}`);
    }

    // حفظ الزيارة باستخدام await
    await this.saveVisit(employee, finalSource, os, browser, deviceType, ipAddress, country);

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`فشل تسجيل الزيارة: ${errMsg}`);
  }
}
  private async saveVisit(
    employee: Employee, 
    source: string, 
    os: string, 
    browser: string, 
    deviceType: string, 
    ipAddress: string, 
    country: string
  ): Promise<void> {
    try {
      // التحقق من الزيارة المتكررة
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
        if (diff < 5 * 60 * 1000) {
          this.logger.log(`تم تجاهل زيارة متكررة للموظف ${employee.id} من المصدر ${source}`);
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
        country,
      });

      await this.visitRepo.save(visit);
      this.logger.log(`تم تسجيل زيارة جديدة للموظف ${employee.id} من ${country} - المصدر: ${source}`);
    } catch (error) {
      this.logger.error(`فشل حفظ الزيارة: ${error}`);
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
      if (!employee) {
        this.logger.warn(`محاولة تسجيل زيارة لموظف غير موجود: ${body.employeeId}`);
        return;
      }

      const source = body.source || 'link';
      const os = body.os || 'unknown';
      const browser = body.browser || 'unknown';
      const deviceType = body.deviceType || 'desktop';
      const ipAddress = body.ipAddress || 'unknown';
      
      // الحصول على الدولة
      const country = await this.getCountryFromIP(ipAddress);

      await this.saveVisit(employee, source, os, browser, deviceType, ipAddress, country);
      
    } catch (err) {
      this.logger.error(`فشل تسجيل الزيارة: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async getCountryStats(employeeId: number): Promise<{ country: string; count: number }[]> {
  try {
    const stats: Array<{ country: string; count: number }> = await this.visitRepo.query(
      `
      SELECT "country", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1 AND "country" != 'unknown' AND "country" != 'localhost'
      GROUP BY "country"
      ORDER BY count DESC
    `,
      [employeeId],
    );

    return stats.filter((stat) => 
      stat.country && 
      stat.country !== 'Undefined' && 
      stat.country !== 'undefined' &&
      stat.country.trim() !== ''
    );
  } catch (error) {
    this.logger.error(`فشل جلب إحصائيات الدول: ${error}`);
    return [];
  }
}

  async getVisitCount(employeeId: number): Promise<number> {
    try {
      return await this.visitRepo
        .createQueryBuilder('visit')
        .where('"employeeId" = :employeeId', { employeeId })
        .getCount();
    } catch (error) {
      this.logger.error(`فشل جلب عدد الزيارات: ${error}`);
      return 0;
    }
  }

 async getDailyVisits(employeeId: number): Promise<DailyVisit[]> {
  try {
    const result: DailyVisit[] = await this.visitRepo.query(
      `
      SELECT DATE("visitedAt") as day, COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `,
      [employeeId],
    );
    
    return result;
  } catch (error) {
    this.logger.error(`فشل جلب الزيارات اليومية: ${error}`);
    return [];
  }
}

  async getDeviceStats(employeeId: number): Promise<DeviceStat[]> {
  try {
    const result: DeviceStat[] = await this.visitRepo.query(
      `
      SELECT "deviceType", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "deviceType"
      ORDER BY count DESC
    `,
      [employeeId],
    );
    
    return result;
  } catch (error) {
    this.logger.error(`فشل جلب إحصائيات الأجهزة: ${error}`);
    return [];
  }
}

 async getBrowserStats(employeeId: number): Promise<{ browser: string; count: number }[]> {
  try {
    const result: Array<{ browser: string; count: number }> = await this.visitRepo.query(
      `
      SELECT "browser", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "browser"
      ORDER BY count DESC
    `,
      [employeeId],
    );
    
    return result;
  } catch (error) {
    this.logger.error(`فشل جلب إحصائيات المتصفحات: ${error}`);
    return [];
  }
}

  async getOSStats(employeeId: number): Promise<{ os: string; count: number }[]> {
  try {
    const result: Array<{ os: string; count: number }> = await this.visitRepo.query(
      `
      SELECT "os", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "os"
      ORDER BY count DESC
    `,
      [employeeId],
    );
    
    return result;
  } catch (error) {
    this.logger.error(`فشل جلب إحصائيات أنظمة التشغيل: ${error}`);
    return [];
  }
}

  async getSourceStats(employeeId: number): Promise<{ source: string; count: number }[]> {
  try {
    const result: Array<{ source: string; count: number }> = await this.visitRepo.query(
      `
      SELECT "source", COUNT(*) as count
      FROM visits
      WHERE "employeeId" = $1
      GROUP BY "source"
      ORDER BY count DESC
    `,
      [employeeId],
    );
    
    return result;
  } catch (error) {
    this.logger.error(`فشل جلب إحصائيات المصادر: ${error}`);
    return [];
  }
}

  async getAllForCompany(companyId: string): Promise<Visit[]> {
    try {
      return await this.visitRepo.find({
        where: { employee: { company: { id: companyId } } },
        relations: ['employee'],
        order: { visitedAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`فشل جلب زيارات الشركة: ${error}`);
      return [];
    }
  }

  async getEmployeeById(id: number): Promise<Employee> {
    try {
      const employee = await this.employeeRepo.findOne({ where: { id } });
      if (!employee) throw new NotFoundException('الموظف غير موجود');
      return employee;
    } catch (error) {
      this.logger.error(`فشل جلب بيانات الموظف: ${error}`);
      throw new NotFoundException('الموظف غير موجود');
    }
  }

  async getDetailedSourceStats(employeeId: number): Promise<{ 
    source: string; 
    count: number;
    percentage: number;
    lastVisit: string;
  }[]> {
    try {
      const totalVisits = await this.getVisitCount(employeeId);
      const sourceStats = await this.getSourceStats(employeeId);
      
      return sourceStats.map(stat => ({
        ...stat,
        percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0,
        lastVisit: new Date().toISOString() 
      }));
    } catch (error) {
      this.logger.error(`فشل جلب الإحصائيات المفصلة للمصادر: ${error}`);
      return [];
    }
  }
}
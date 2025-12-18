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
  countryCode?: string;
}

@Injectable()
export class VisitService {
  private readonly logger = new Logger(VisitService.name);
  
  private readonly countryTranslations: { [key: string]: string } = {
    'localhost': 'محلي',
    'Localhost': 'محلي',
    'LOCALHOST': 'محلي',
    '127.0.0.1': 'محلي',
    '::1': 'محلي',
    '::ffff:127.0.0.1': 'محلي',
    'unknown': 'غير معروف',
    'Unknown': 'غير معروف',
    'UNKNOWN': 'غير معروف',
    'غير معروف': 'غير معروف',
    
    'Saudi Arabia': 'السعودية',
    'Kingdom of Saudi Arabia': 'السعودية',
    'United Arab Emirates': 'الإمارات',
    'UAE': 'الإمارات',
    'Qatar': 'قطر',
    'State of Qatar': 'قطر',
    'Kuwait': 'الكويت',
    'State of Kuwait': 'الكويت',
    'Oman': 'عُمان',
    'Sultanate of Oman': 'عُمان',
    'Bahrain': 'البحرين',
    'Kingdom of Bahrain': 'البحرين',
    'Egypt': 'مصر',
    'Arab Republic of Egypt': 'مصر',
    'Jordan': 'الأردن',
    'Hashemite Kingdom of Jordan': 'الأردن',
    'Lebanon': 'لبنان',
    'Lebanese Republic': 'لبنان',
    'Syria': 'سوريا',
    'Syrian Arab Republic': 'سوريا',
    'Iraq': 'العراق',
    'Republic of Iraq': 'العراق',
    'Yemen': 'اليمن',
    'Republic of Yemen': 'اليمن',
    'Palestine': 'فلسطين',
    'State of Palestine': 'فلسطين',
    'Tunisia': 'تونس',
    'Tunisian Republic': 'تونس',
    'Algeria': 'الجزائر',
    "People's Democratic Republic of Algeria": 'الجزائر',
    'Morocco': 'المغرب',
    'Kingdom of Morocco': 'المغرب',
    'Libya': 'ليبيا',
    'State of Libya': 'ليبيا',
    'Sudan': 'السودان',
    'Republic of the Sudan': 'السعودية',
    'Mauritania': 'موريتانيا',
    'Islamic Republic of Mauritania': 'موريتانيا',
    'Somalia': 'الصومال',
    'Federal Republic of Somalia': 'الصومال',
    'Djibouti': 'جيبوتي',
    'Republic of Djibouti': 'جيبوتي',
    'Comoros': 'جزر القمر',
    'Union of the Comoros': 'جزر القمر',
    
    'United States': 'الولايات المتحدة',
    'United States of America': 'الولايات المتحدة',
    'USA': 'الولايات المتحدة',
    'US': 'الولايات المتحدة',
    'United Kingdom': 'بريطانيا',
    'UK': 'بريطانيا',
    'Great Britain': 'بريطانيا',
    'Britain': 'بريطانيا',
    'Germany': 'ألمانيا',
    'Federal Republic of Germany': 'ألمانيا',
    'France': 'فرنسا',
    'French Republic': 'فرنسا',
    'Italy': 'إيطاليا',
    'Italian Republic': 'إيطاليا',
    'Spain': 'إسبانيا',
    'Kingdom of Spain': 'إسبانيا',
    'Turkey': 'تركيا',
    'Republic of Turkey': 'تركيا',
    'Türkiye': 'تركيا',
    'Russia': 'روسيا',
    'Russian Federation': 'روسيا',
    'China': 'الصين',
    "People's Republic of China": 'الصين',
    'Japan': 'اليابان',
    'India': 'الهند',
    'Republic of India': 'الهند',
    'Brazil': 'البرازيل',
    'Federative Republic of Brazil': 'البرازيل',
    'Canada': 'كندا',
    'Australia': 'أستراليا',
    'Commonwealth of Australia': 'أستراليا',
    'South Korea': 'كوريا الجنوبية',
    'Republic of Korea': 'كوريا الجنوبية',
    'Netherlands': 'هولندا',
    'Kingdom of the Netherlands': 'هولندا',
    'Switzerland': 'سويسرا',
    'Swiss Confederation': 'سويسرا',
    'Sweden': 'السويد',
    'Kingdom of Sweden': 'السويد',
    'Norway': 'النرويج',
    'Kingdom of Norway': 'النرويج',
    'Denmark': 'الدنمارك',
    'Kingdom of Denmark': 'الدنمارك',
    'Finland': 'فنلندا',
    'Republic of Finland': 'فنلندا',
    'Belgium': 'بلجيكا',
    'Kingdom of Belgium': 'بلجيكا',
    'Austria': 'النمسا',
    'Republic of Austria': 'النمسا',
    'Poland': 'بولندا',
    'Republic of Poland': 'بولندا',
    'Portugal': 'البرتغال',
    'Portuguese Republic': 'البرتغال',
    'Greece': 'اليونان',
    'Hellenic Republic': 'اليونان',
    'Iran': 'إيران',
    'Islamic Republic of Iran': 'إيران',
    'Israel': 'إسرائيل',
    'State of Israel': 'إسرائيل',
    'Pakistan': 'باكستان',
    'Islamic Republic of Pakistan': 'باكستان',
    'Bangladesh': 'بنغلاديش',
    "People's Republic of Bangladesh": 'بنغلاديش',
    'Indonesia': 'إندونيسيا',
    'Republic of Indonesia': 'إندونيسيا',
    'Malaysia': 'ماليزيا',
    'Singapore': 'سنغافورة',
    'Republic of Singapore': 'سنغافورة',
    'Thailand': 'تايلاند',
    'Kingdom of Thailand': 'تايلاند',
    'Vietnam': 'فيتنام',
    'Socialist Republic of Vietnam': 'فيتنام',
    'Philippines': 'الفلبين',
    'Republic of the Philippines': 'الفلبين',
    'Mexico': 'المكسيك',
    'United Mexican States': 'المكسيك',
    'Argentina': 'الأرجنتين',
    'Argentine Republic': 'الأرجنتين',
    'Chile': 'تشيلي',
    'Republic of Chile': 'تشيلي',
    'South Africa': 'جنوب أفريقيا',
    'Republic of South Africa': 'جنوب أفريقيا',
    'Nigeria': 'نيجيريا',
    'Federal Republic of Nigeria': 'نيجيريا',
    'Kenya': 'كينيا',
    'Republic of Kenya': 'كينيا',
    'Ethiopia': 'إثيوبيا',
    'Federal Democratic Republic of Ethiopia': 'إثيوبيا',
    'Ghana': 'غانا',
    'Republic of Ghana': 'غانا',
    'Ukraine': 'أوكرانيا',
    'Czech Republic': 'جمهورية التشيك',
    'Czechia': 'جمهورية التشيك',
    'Slovakia': 'سلوفاكيا',
    'Slovak Republic': 'سلوفاكيا',
    'Croatia': 'كرواتيا',
    'Republic of Croatia': 'كرواتيا',
    'Serbia': 'صربيا',
    'Republic of Serbia': 'صربيا',
    'Bulgaria': 'بلغاريا',
    'Republic of Bulgaria': 'بلغاريا',
    'Romania': 'رومانيا',
    'Hungary': 'المجر',
    'Ireland': 'أيرلندا',
    'Republic of Ireland': 'أيرلندا',
    'Scotland': 'إسكتلندا',
    'Wales': 'ويلز',
    'New Zealand': 'نيوزيلندا',
    'Malta': 'مالطا',
    'Republic of Malta': 'مالطا',
    'Cyprus': 'قبرص',
    'Republic of Cyprus': 'قبرص',
    'Sri Lanka': 'سريلانكا',
    'Democratic Socialist Republic of Sri Lanka': 'سريلانكا',
    'Nepal': 'نيبال',
    'Federal Democratic Republic of Nepal': 'نيبال',
    'Afghanistan': 'أفغانستان',
    'Islamic Emirate of Afghanistan': 'أفغانستان',
  };

  constructor(
    @InjectRepository(Visit)
    private readonly visitRepo: Repository<Visit>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}


  private translateCountryToArabic(countryName: string): string {
    if (!countryName || countryName === '') {
      return 'غير معروف';
    }

    const trimmedCountry = countryName.trim();
    
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmedCountry)) {
      return trimmedCountry;
    }

    const exactMatch = this.countryTranslations[trimmedCountry];
    if (exactMatch) {
      return exactMatch;
    }

    const lowerTrimmed = trimmedCountry.toLowerCase();
    for (const [englishName, arabicName] of Object.entries(this.countryTranslations)) {
      if (englishName.toLowerCase() === lowerTrimmed) {
        return arabicName;
      }
    }

    for (const [englishName, arabicName] of Object.entries(this.countryTranslations)) {
      if (englishName.toLowerCase().includes(lowerTrimmed) || 
          lowerTrimmed.includes(englishName.toLowerCase())) {
        return arabicName;
      }
    }

    return trimmedCountry;
  }

  private async getCountryFromIP(ip: string): Promise<string> {
    try {
      const cleanIP = ip.replace(/^::ffff:/, '');
      
      if (cleanIP === '127.0.0.1' || cleanIP === '::1' || 
          cleanIP === 'localhost' || cleanIP.startsWith('192.168.') || 
          cleanIP.startsWith('10.') || 
          (cleanIP.startsWith('172.') && parseInt(cleanIP.split('.')[1] || '0') >= 16 && 
           parseInt(cleanIP.split('.')[1] || '0') <= 31)) {
        return 'محلي';
      }

      if (cleanIP === 'unknown' || !cleanIP || cleanIP === '') {
        return 'غير معروف';
      }

      try {
        const response = await axios.get<IpApiResponse>(`http://ip-api.com/json/${cleanIP}`, {
          timeout: 3000
        });
        
        if (response.data && response.data.status === 'success') {
          if (response.data.country) {
            const arabicName = this.translateCountryToArabic(response.data.country);
            this.logger.debug(`[ip-api.com] تم تحديد الدولة لـ ${cleanIP}: ${response.data.country} -> ${arabicName}`);
            return arabicName;
          }
          
          if (response.data.countryCode) {
            const countryName = this.getCountryNameFromCode(response.data.countryCode);
            const arabicName = this.translateCountryToArabic(countryName);
            this.logger.debug(`[ip-api.com] تم تحديد الدولة من الكود لـ ${cleanIP}: ${response.data.countryCode} -> ${arabicName}`);
            return arabicName;
          }
        }
      } catch (ipApiError) {
        this.logger.warn(`[ip-api.com] فشل لـ IP ${cleanIP}: ${ipApiError}`);
      }

      try {
        const response = await axios.get<string>(`http://ipapi.co/${cleanIP}/country_name/`, {
          timeout: 3000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.data && typeof response.data === 'string' && 
            response.data !== 'Undefined' && response.data !== 'undefined') {
          const country = response.data.trim();
          if (country && country !== '' && country !== 'Undefined' && country !== 'undefined') {
            const arabicName = this.translateCountryToArabic(country);
            this.logger.debug(`[ipapi.co] تم تحديد الدولة لـ ${cleanIP}: ${country} -> ${arabicName}`);
            return arabicName;
          }
        }
      } catch (ipapiError) {
        this.logger.warn(`[ipapi.co] فشل لـ IP ${cleanIP}: ${ipapiError}`);
      }

      try {
        if (process.env.IPINFO_TOKEN) {
          const response = await axios.get<{country?: string}>(`https://ipinfo.io/${cleanIP}?token=${process.env.IPINFO_TOKEN}`, {
            timeout: 3000
          });
          
          if (response.data && response.data.country) {
            const arabicName = this.translateCountryToArabic(response.data.country);
            this.logger.debug(`[ipinfo.io] تم تحديد الدولة لـ ${cleanIP}: ${response.data.country} -> ${arabicName}`);
            return arabicName;
          }
        }
      } catch (ipinfoError) {
        this.logger.warn(`[ipinfo.io] فشل لـ IP ${cleanIP}: ${ipinfoError}`);
      }

      this.logger.warn(` لم يتم تحديد الدولة لـ IP: ${cleanIP}`);
      return 'غير معروف';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` خطأ عام في تحديد الدولة لـ IP ${ip}: ${errorMessage}`);
      return 'غير معروف';
    }
  }

  
  private getCountryNameFromCode(countryCode: string): string {
    const countryCodes: { [key: string]: string } = {
      'SA': 'Saudi Arabia',
      'AE': 'United Arab Emirates',
      'QA': 'Qatar',
      'KW': 'Kuwait',
      'OM': 'Oman',
      'BH': 'Bahrain',
      'EG': 'Egypt',
      'JO': 'Jordan',
      'LB': 'Lebanon',
      'SY': 'Syria',
      'IQ': 'Iraq',
      'YE': 'Yemen',
      'PS': 'Palestine',
      'TN': 'Tunisia',
      'DZ': 'Algeria',
      'MA': 'Morocco',
      'LY': 'Libya',
      'SD': 'Sudan',
      'MR': 'Mauritania',
      'SO': 'Somalia',
      'DJ': 'Djibouti',
      'KM': 'Comoros',
      
      'US': 'United States',
      'GB': 'United Kingdom',
      'DE': 'Germany',
      'FR': 'France',
      'IT': 'Italy',
      'ES': 'Spain',
      'TR': 'Turkey',
      'RU': 'Russia',
      'CN': 'China',
      'JP': 'Japan',
      'IN': 'India',
      'BR': 'Brazil',
      'CA': 'Canada',
      'AU': 'Australia',
      'KR': 'South Korea',
      'NL': 'Netherlands',
      'CH': 'Switzerland',
      'SE': 'Sweden',
      'NO': 'Norway',
      'DK': 'Denmark',
      'FI': 'Finland',
      'BE': 'Belgium',
      'AT': 'Austria',
      'PL': 'Poland',
      'PT': 'Portugal',
      'GR': 'Greece',
      'IR': 'Iran',
      'IL': 'Israel',
      'PK': 'Pakistan',
      'BD': 'Bangladesh',
      'ID': 'Indonesia',
      'MY': 'Malaysia',
      'SG': 'Singapore',
      'TH': 'Thailand',
      'VN': 'Vietnam',
      'PH': 'Philippines',
      'MX': 'Mexico',
      'AR': 'Argentina',
      'CL': 'Chile',
      'ZA': 'South Africa',
      'NG': 'Nigeria',
      'KE': 'Kenya',
      'ET': 'Ethiopia',
      'GH': 'Ghana',
      'UA': 'Ukraine',
      'CZ': 'Czech Republic',
      'SK': 'Slovakia',
      'HR': 'Croatia',
      'RS': 'Serbia',
      'BG': 'Bulgaria',
      'RO': 'Romania',
      'HU': 'Hungary',
      'IE': 'Ireland',
      'NZ': 'New Zealand',
      'MT': 'Malta',
      'CY': 'Cyprus',
      'LK': 'Sri Lanka',
      'NP': 'Nepal',
      'AF': 'Afghanistan',
    };
    
    const code = countryCode.toUpperCase();
    return countryCodes[code] || code;
  }

  private extractIPFromRequest(req?: Request): string {
    try {
      if (!req) {
        this.logger.debug(' Request غير موجود لاستخراج IP');
        return 'unknown';
      }
      
      let ip = 'unknown';
      
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        if (Array.isArray(xForwardedFor)) {
          ip = xForwardedFor[0]?.trim() || 'unknown';
        } else {
          ip = xForwardedFor.split(',')[0]?.trim() || 'unknown';
        }
        if (ip !== 'unknown') {
          this.logger.debug(` تم استخراج IP من x-forwarded-for: ${ip}`);
        }
      }
      
      if (!ip || ip === 'unknown') {
        ip = req.ip || 'unknown';
        if (ip !== 'unknown') {
          this.logger.debug(` تم استخراج IP من req.ip: ${ip}`);
        }
      }
      
      if (!ip || ip === 'unknown') {
        ip = req.connection?.remoteAddress || 'unknown';
        if (ip !== 'unknown') {
          this.logger.debug(` تم استخراج IP من req.connection.remoteAddress: ${ip}`);
        }
      }
      
      if (!ip || ip === 'unknown') {
        ip = req.socket?.remoteAddress || 'unknown';
        if (ip !== 'unknown') {
          this.logger.debug(` تم استخراج IP من req.socket.remoteAddress: ${ip}`);
        }
      }
      
      if (ip && ip !== 'unknown') {
        ip = ip.replace(/^::ffff:/, '');
        const parts = ip.split(':');
        if (parts.length > 1 && !parts[0].includes('.')) {
          ip = parts[0];
        }
      }
      
      if (ip === 'unknown') {
        this.logger.warn(' لم يتم العثور على IP في الطلب');
      } else {
        this.logger.debug(` الـ IP النهائي: ${ip}`);
      }
      
      return ip;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل استخراج IP من الطلب: ${errorMessage}`);
      return 'unknown';
    }
  }

  private determineFinalSource(req?: Request, defaultSource: string = 'link'): string {
    if (!req) {
      this.logger.debug(' Request غير موجود لتحديد المصدر');
      return defaultSource;
    }

    try {
      this.logger.debug(` Request URL: ${req.url}`);
      
      if (req.query && Object.keys(req.query).length > 0) {
        this.logger.debug(` جميع query parameters: ${JSON.stringify(req.query)}`);
      }

      if (req.query?.source) {
        const sourceParam = req.query.source;
        this.logger.debug(` تم العثور على source parameter: ${JSON.stringify(sourceParam)}`);
        
        let source: string;
        if (Array.isArray(sourceParam)) {
          const firstElement = sourceParam[0];
          source = typeof firstElement === 'string' ? firstElement : defaultSource;
          this.logger.debug(` تم معالجة source كمصفوفة: ${source}`);
        } else {
          source = typeof sourceParam === 'string' ? sourceParam : defaultSource;
          this.logger.debug(` تم معالجة source كـ string: ${source}`);
        }
        
        this.logger.debug(` المصدر النهائي المستخرج: ${source}`);
        return source.toLowerCase();
      } else {
        this.logger.debug(' لم يتم العثور على source parameter في query');
      }

      if (req.headers && req.headers.referer) {
        this.logger.debug(` Referer header: ${req.headers.referer}`);
      }

      this.logger.debug(` استخدام المصدر الافتراضي: ${defaultSource}`);
      return defaultSource;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل تحديد المصدر: ${errorMessage}`);
      return defaultSource;
    }
  }

  async logVisit(employee: Employee, source: string = 'link', req?: Request): Promise<void> {
    try {
      this.logger.log(` بدء تسجيل زيارة للموظف: ${employee.id} - ${employee.name}`);
      
      const ua = req?.headers['user-agent'] || '';
      const parser = new UAParser(ua);
      
      const os = parser.getOS().name || 'غير معروف';
      const browser = parser.getBrowser().name || 'غير معروف';
      const device = parser.getDevice();
      const deviceType = device.type || 'desktop';
      
      const ipAddress = this.extractIPFromRequest(req);
      this.logger.log(` عنوان IP للزيارة: ${ipAddress}`);
      
      if (req) {
        this.logger.debug(` URL المستخدم: ${req.url}`);
        this.logger.debug(` الـ source الافتراضي الممرر: ${source}`);
      }

      const finalSource = this.determineFinalSource(req, source);
      this.logger.debug(` المصدر النهائي للزيارة: ${finalSource}`);

      this.logger.debug(` جاري تحديد الدولة للـ IP: ${ipAddress}`);
      let country = 'غير معروف';
      try {
        country = await this.getCountryFromIP(ipAddress);
        this.logger.log(` الدولة المحددة: ${country} (من IP: ${ipAddress})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(` فشل الحصول على الدولة لـ IP ${ipAddress}: ${errorMessage}`);
      }

      await this.saveVisit(employee, finalSource, os, browser, deviceType, ipAddress, country);
      
      this.logger.log(` تم تسجيل الزيارة بنجاح للموظف ${employee.id}`);

    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل تسجيل الزيارة: ${errMsg}`);
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
      const finalSource = source.toLowerCase();
      const finalOS = this.translateToArabic(os);
      const finalBrowser = this.translateToArabic(browser);
      const finalDeviceType = this.translateToArabic(deviceType);
      const finalCountry = this.translateCountryToArabic(country);
      
      this.logger.debug(`البيانات قبل التحقق من التكرار:`);
      this.logger.debug(`   - الموظف: ${employee.id}`);
      this.logger.debug(`   - المصدر: ${finalSource}`);
      this.logger.debug(`   - نظام التشغيل: ${finalOS}`);
      this.logger.debug(`   - المتصفح: ${finalBrowser}`);
      this.logger.debug(`   - نوع الجهاز: ${finalDeviceType}`);
      this.logger.debug(`   - الـ IP: ${ipAddress}`);
      this.logger.debug(`   - الدولة: ${finalCountry}`);

      const recentVisit = await this.visitRepo.findOne({
        where: {
          employee: { id: employee.id },
          source: finalSource,
          os: finalOS,
          browser: finalBrowser,
          deviceType: finalDeviceType,
          ipAddress: ipAddress,
        },
        order: { visitedAt: 'DESC' },
      });

      if (recentVisit) {
        const diff = Date.now() - new Date(recentVisit.visitedAt).getTime();
        if (diff < 5 * 60 * 1000) {  
          this.logger.log(` تم تجاهل زيارة متكررة للموظف ${employee.id} من ${finalCountry} (آخر زيارة قبل ${Math.round(diff/1000)} ثانية)`);
          return;
        }
      }

      const visit = this.visitRepo.create({
        employee: { id: employee.id },
        source: finalSource,
        os: finalOS,
        browser: finalBrowser,
        deviceType: finalDeviceType,
        ipAddress: ipAddress,
        country: finalCountry,
      });

      await this.visitRepo.save(visit);
      this.logger.log(` تم تسجيل زيارة جديدة للموظف ${employee.id} من ${finalCountry} - المصدر: ${finalSource}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل حفظ الزيارة: ${errorMessage}`);
      throw error;
    }
  }

  private translateToArabic(text: string): string {
    if (!text) return 'غير معروف';
    
    const translations: { [key: string]: string } = {
      'Windows': 'ويندوز',
      'Mac OS': 'ماك',
      'iOS': 'آي أو إس',
      'Android': 'أندرويد',
      'Linux': 'لينكس',
      'Chrome OS': 'كروم',
      'Ubuntu': 'أوبونتو',
      'Fedora': 'فيدورا',
      'Debian': 'ديبيان',
      
      'Chrome': 'كروم',
      'Firefox': 'فايرفوكس',
      'Safari': 'سفاري',
      'Edge': 'إيدج',
      'Opera': 'أوبرا',
      'Internet Explorer': 'إنترنت إكسبلورر',
      'Brave': 'بريف',
      'Vivaldi': 'فيفالدي',
      
      'mobile': 'جوال',
      'tablet': 'تابلت',
      'desktop': 'كمبيوتر',
      'smarttv': 'تلفاز ذكي',
      'wearable': 'جهاز قابل للارتداء',
      'console': 'كونسول',
      
      'unknown': 'غير معروف',
      'undefined': 'غير معروف',
      'null': 'غير معروف',
      '': 'غير معروف'
    };
    
    const trimmed = text.trim();
    const exactMatch = translations[trimmed];
    if (exactMatch) return exactMatch;
    
    const lowerText = trimmed.toLowerCase();
    for (const [english, arabic] of Object.entries(translations)) {
      if (english.toLowerCase() === lowerText) {
        return arabic;
      }
    }
    
    return trimmed;
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
      this.logger.log(` بدء تسجيل زيارة مباشرة للموظف: ${body.employeeId}`);
      
      const employee = await this.employeeRepo.findOne({ 
        where: { id: body.employeeId } 
      });
      
      if (!employee) {
        this.logger.warn(` محاولة تسجيل زيارة لموظف غير موجود: ${body.employeeId}`);
        return;
      }

      const source = body.source || 'link';
      const os = body.os || 'غير معروف';
      const browser = body.browser || 'غير معروف';
      const deviceType = body.deviceType || 'كمبيوتر';
      const ipAddress = body.ipAddress || 'unknown';
      
      this.logger.debug(` بيانات الزيارة المباشرة:`);
      this.logger.debug(`   - المصدر: ${source}`);
      this.logger.debug(`   - نظام التشغيل: ${os}`);
      this.logger.debug(`   - المتصفح: ${browser}`);
      this.logger.debug(`   - نوع الجهاز: ${deviceType}`);
      this.logger.debug(`   - الـ IP: ${ipAddress}`);

      const country = await this.getCountryFromIP(ipAddress);
      this.logger.log(` الدولة المحددة للزيارة المباشرة: ${country}`);

      await this.saveVisit(employee, source, os, browser, deviceType, ipAddress, country);
      
      this.logger.log(` تم تسجيل الزيارة المباشرة بنجاح للموظف ${employee.id}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(` فشل تسجيل الزيارة المباشرة: ${errorMessage}`);
    }
  }

  async getCountryStats(employeeId: number): Promise<{ country: string; count: number }[]> {
    try {
      this.logger.debug(` جاري جلب إحصائيات الدول للموظف: ${employeeId}`);
      
      const stats: Array<{ country: string; count: string }> = await this.visitRepo.query(
        `
        SELECT "country", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1 
          AND "country" IS NOT NULL
          AND TRIM("country") != ''
        GROUP BY "country"
        ORDER BY count DESC
        `,
        [employeeId],
      );

      this.logger.debug(` عدد الدول المسجلة: ${stats.length}`);

      const formattedStats = stats.map(stat => ({
        country: stat.country,
        count: parseInt(stat.count || '0', 10)
      }));

      const filteredStats = formattedStats.filter((stat) => {
        const isValid = stat.country && 
                       stat.country.trim() !== '' &&
                       stat.count > 0 &&
                       !stat.country.toLowerCase().includes('undefined');
        
        if (!isValid) {
          this.logger.debug(`  تم استبعاد دولة: ${stat.country} - عدد: ${stat.count}`);
        }
        
        return isValid;
      });

      this.logger.log(` تم جلب إحصائيات ${filteredStats.length} دولة للموظف ${employeeId}`);
      return filteredStats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات الدول: ${errorMessage}`);
      return [];
    }
  }

  async getVisitCount(employeeId: number): Promise<number> {
    try {
      const count = await this.visitRepo
        .createQueryBuilder('visit')
        .where('"employeeId" = :employeeId', { employeeId })
        .getCount();
      
      this.logger.debug(` عدد الزيارات الإجمالي للموظف ${employeeId}: ${count}`);
      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب عدد الزيارات: ${errorMessage}`);
      return 0;
    }
  }

  async getDailyVisits(employeeId: number): Promise<DailyVisit[]> {
    try {
      const result: Array<{ day: string; count: string }> = await this.visitRepo.query(
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
      
      const visits = result.map(item => ({
        day: item.day,
        count: parseInt(item.count || '0', 10)
      }));
      
      this.logger.debug(` عدد الأيام المسجلة للموظف ${employeeId}: ${visits.length}`);
      return visits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب الزيارات اليومية: ${errorMessage}`);
      return [];
    }
  }

  async getDeviceStats(employeeId: number): Promise<DeviceStat[]> {
    try {
      const result: Array<{ deviceType: string; count: string }> = await this.visitRepo.query(
        `
        SELECT "deviceType", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "deviceType"
        ORDER BY count DESC
        `,
        [employeeId],
      );
      
      const stats = result.map(item => ({
        deviceType: item.deviceType,
        count: parseInt(item.count || '0', 10)
      }));
      
      this.logger.debug(` عدد أنواع الأجهزة للموظف ${employeeId}: ${stats.length}`);
      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات الأجهزة: ${errorMessage}`);
      return [];
    }
  }

  async getBrowserStats(employeeId: number): Promise<{ browser: string; count: number }[]> {
    try {
      const result: Array<{ browser: string; count: string }> = await this.visitRepo.query(
        `
        SELECT "browser", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "browser"
        ORDER BY count DESC
        `,
        [employeeId],
      );
      
      const stats = result.map(item => ({
        browser: item.browser,
        count: parseInt(item.count || '0', 10)
      }));
      
      this.logger.debug(` عدد المتصفحات للموظف ${employeeId}: ${stats.length}`);
      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات المتصفحات: ${errorMessage}`);
      return [];
    }
  }

  async getOSStats(employeeId: number): Promise<{ os: string; count: number }[]> {
    try {
      const result: Array<{ os: string; count: string }> = await this.visitRepo.query(
        `
        SELECT "os", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "os"
        ORDER BY count DESC
        `,
        [employeeId],
      );
      
      const stats = result.map(item => ({
        os: item.os,
        count: parseInt(item.count || '0', 10)
      }));
      
      this.logger.debug(` عدد أنظمة التشغيل للموظف ${employeeId}: ${stats.length}`);
      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات أنظمة التشغيل: ${errorMessage}`);
      return [];
    }
  }

  async getSourceStats(employeeId: number): Promise<{ source: string; count: number }[]> {
    try {
      const result: Array<{ source: string; count: string }> = await this.visitRepo.query(
        `
        SELECT "source", COUNT(*) as count
        FROM visits
        WHERE "employeeId" = $1
        GROUP BY "source"
        ORDER BY count DESC
        `,
        [employeeId],
      );
      
      const stats = result.map(item => ({
        source: item.source,
        count: parseInt(item.count || '0', 10)
      }));
      
      this.logger.debug(` عدد مصادر الزيارات للموظف ${employeeId}: ${stats.length}`);
      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات المصادر: ${errorMessage}`);
      return [];
    }
  }

  async getAllForCompany(companyId: string): Promise<Visit[]> {
    try {
      const visits = await this.visitRepo.find({
        where: { employee: { company: { id: companyId } } },
        relations: ['employee'],
        order: { visitedAt: 'DESC' },
      });
      
      this.logger.debug(` عدد زيارات الشركة ${companyId}: ${visits.length}`);
      return visits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب زيارات الشركة: ${errorMessage}`);
      return [];
    }
  }

  async getEmployeeById(id: number): Promise<Employee> {
    try {
      const employee = await this.employeeRepo.findOne({ where: { id } });
      if (!employee) throw new NotFoundException('الموظف غير موجود');
      return employee;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب بيانات الموظف: ${errorMessage}`);
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
      
      const detailedStats = sourceStats.map(stat => ({
        ...stat,
        percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0,
        lastVisit: new Date().toISOString() 
      }));
      
      this.logger.debug(` عدد مصادر الزيارات المفصلة للموظف ${employeeId}: ${detailedStats.length}`);
      return detailedStats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب الإحصائيات المفصلة للمصادر: ${errorMessage}`);
      return [];
    }
  }

  async getQRvsLinkStats(employeeId: number): Promise<{
    qrCount: number;
    linkCount: number;
    qrPercentage: number;
    linkPercentage: number;
    total: number;
  }> {
    try {
      const sourceStats = await this.getSourceStats(employeeId);
      const totalVisits = await this.getVisitCount(employeeId);
      
      const qrCount = sourceStats.find(stat => stat.source.toLowerCase() === 'qr')?.count || 0;
      const linkCount = sourceStats.find(stat => stat.source.toLowerCase() === 'link')?.count || 0;
      
      const stats = {
        qrCount,
        linkCount,
        qrPercentage: totalVisits > 0 ? Math.round((qrCount / totalVisits) * 100) : 0,
        linkPercentage: totalVisits > 0 ? Math.round((linkCount / totalVisits) * 100) : 0,
        total: totalVisits
      };
      
      this.logger.debug(` إحصائيات QR vs Link للموظف ${employeeId}:`, stats);
      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات QR vs Link: ${errorMessage}`);
      return {
        qrCount: 0,
        linkCount: 0,
        qrPercentage: 0,
        linkPercentage: 0,
        total: 0
      };
    }
  }

  translateCountryName(countryName: string): string {
    return this.translateCountryToArabic(countryName);
  }

  async getDetailedStats(employeeId: number): Promise<{
    totalVisits: number;
    uniqueCountries: number;
    countries: { country: string; count: number; percentage: number }[];
    devices: DeviceStat[];
    browsers: { browser: string; count: number; percentage: number }[];
    os: { os: string; count: number; percentage: number }[];
    sources: { source: string; count: number; percentage: number }[];
    dailyVisits: DailyVisit[];
  }> {
    try {
      this.logger.log(` جاري جلب الإحصائيات المفصلة للموظف: ${employeeId}`);
      
      const [
        totalVisits,
        countryStats,
        deviceStats,
        browserStats,
        osStats,
        sourceStats,
        dailyVisits
      ] = await Promise.all([
        this.getVisitCount(employeeId),
        this.getCountryStats(employeeId),
        this.getDeviceStats(employeeId),
        this.getBrowserStats(employeeId),
        this.getOSStats(employeeId),
        this.getSourceStats(employeeId),
        this.getDailyVisits(employeeId)
      ]);

      const detailedStats = {
        totalVisits,
        uniqueCountries: countryStats.length,
        countries: countryStats.map(stat => ({
          ...stat,
          percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0
        })),
        devices: deviceStats,
        browsers: browserStats.map(stat => ({
          ...stat,
          percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0
        })),
        os: osStats.map(stat => ({
          ...stat,
          percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0
        })),
        sources: sourceStats.map(stat => ({
          ...stat,
          percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0
        })),
        dailyVisits
      };
      
      this.logger.log(` تم جلب الإحصائيات المفصلة للموظف ${employeeId}`);
      this.logger.debug(`   - إجمالي الزيارات: ${totalVisits}`);
      this.logger.debug(`   - عدد الدول: ${countryStats.length}`);
      this.logger.debug(`   - عدد أنواع الأجهزة: ${deviceStats.length}`);
      this.logger.debug(`   - عدد المتصفحات: ${browserStats.length}`);
      this.logger.debug(`   - عدد أنظمة التشغيل: ${osStats.length}`);
      this.logger.debug(`   - عدد المصادر: ${sourceStats.length}`);
      this.logger.debug(`   - عدد الأيام: ${dailyVisits.length}`);
      
      return detailedStats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب الإحصائيات المفصلة: ${errorMessage}`);
      throw error;
    }
  }

  async debugCountryData(employeeId: number): Promise<any> {
    try {
      const rawData = await this.visitRepo.find({
        where: { employee: { id: employeeId } },
        select: ['id', 'country', 'ipAddress', 'source', 'visitedAt'],
        order: { visitedAt: 'DESC' },
        take: 50
      });
      
      this.logger.debug(` تحليل بيانات الزيارات للموظف ${employeeId}:`);
      this.logger.debug(`   - عدد الزيارات: ${rawData.length}`);
      
      const countryMap = new Map<string, number>();
      const ipMap = new Map<string, number>();
      
      rawData.forEach(visit => {
        const countryCount = countryMap.get(visit.country) || 0;
        countryMap.set(visit.country, countryCount + 1);
        
        const ipCount = ipMap.get(visit.ipAddress) || 0;
        ipMap.set(visit.ipAddress, ipCount + 1);
      });
      
      const result = {
        totalVisits: rawData.length,
        countries: Array.from(countryMap.entries()).map(([country, count]) => ({
          country,
          count
        })),
        ips: Array.from(ipMap.entries()).map(([ip, count]) => ({
          ip,
          count
        })),
        recentVisits: rawData.map(visit => ({
          id: visit.id,
          country: visit.country,
          ip: visit.ipAddress,
          source: visit.source,
          date: visit.visitedAt
        }))
      };
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` خطأ في التحقق من بيانات الدول: ${errorMessage}`);
      return [];
    }
  }

  async checkVisitsFromIP(ipAddress: string): Promise<Visit[]> {
    try {
      const visits = await this.visitRepo.find({
        where: { ipAddress },
        relations: ['employee'],
        order: { visitedAt: 'DESC' },
      });
      
      this.logger.debug(` عدد الزيارات من IP ${ipAddress}: ${visits.length}`);
      return visits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` خطأ في البحث عن الزيارات من IP: ${errorMessage}`);
      return [];
    }
  }

  async cleanupInvalidVisits(employeeId: number): Promise<void> {
    try {
      const result = await this.visitRepo.createQueryBuilder()
        .delete()
        .where('"employeeId" = :employeeId', { employeeId })
        .andWhere('("country" = :unknown OR "country" IS NULL OR "country" = :empty OR "country" = :undefined)', {
          unknown: 'غير معروف',
          empty: '',
          undefined: 'undefined'
        })
        .execute();
      
      this.logger.log(`  تم حذف ${result.affected} زيارة غير صحيحة للموظف ${employeeId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` خطأ في تنظيف الزيارات: ${errorMessage}`);
    }
  }

  async getFilteredCountryStats(employeeId: number): Promise<{ country: string; count: number; percentage: number }[]> {
    try {
      const totalVisits = await this.getVisitCount(employeeId);
      const countryStats = await this.getCountryStats(employeeId);
      
      const filteredStats = countryStats.filter(stat => {
        const excludedCountries = [
          'غير معروف',
          'localhost',
          'محلي',
          'Undefined',
          'undefined',
          '',
          'unknown'
        ];
        
        const isValid = !excludedCountries.includes(stat.country) && stat.count > 0;
        
        if (!isValid) {
          this.logger.debug(`  تم استبعاد دولة في الفلترة: ${stat.country}`);
        }
        
        return isValid;
      });
      
      const result = filteredStats.map(stat => ({
        ...stat,
        percentage: totalVisits > 0 ? Math.round((stat.count / totalVisits) * 100) : 0
      }));
      
      this.logger.debug(` عدد الدول بعد الفلترة: ${result.length}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب إحصائيات الدول المصفاة: ${errorMessage}`);
      return [];
    }
  }
}
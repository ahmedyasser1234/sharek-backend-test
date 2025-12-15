/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface FileSystemError extends Error {
  code?: string;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly uploadsBasePath = path.join(process.cwd(), 'uploads');
  private readonly fontsBasePath = path.join(this.uploadsBasePath, 'fonts');

  constructor() {
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.uploadsBasePath)) {
      fs.mkdirSync(this.uploadsBasePath, { recursive: true });
    }
    if (!fs.existsSync(this.fontsBasePath)) {
      fs.mkdirSync(this.fontsBasePath, { recursive: true });
    }
  }

  async uploadFont(
    file: Express.Multer.File, 
    companyId: string,
    fontType?: string
  ): Promise<{ 
    fileName: string; 
    filePath: string; 
    fileUrl: string;
    mimeType: string;
    fileSize: number;
    fontType: string;
  }> {
    try {
      if (!file || !file.buffer || !Buffer.isBuffer(file.buffer)) {
        throw new BadRequestException('ملف الخط غير صالح أو لا يحتوي على بيانات');
      }

      const fileName = file.originalname || '';
      const fileExtension = this.getFileExtension(fileName);
      
      const isFontFile = this.isFontFile(file);
      
      if (!isFontFile) {
        const supportedExtensions = [
          'ttf', 'otf', 'woff', 'woff2', 'eot', 'svg',
          'ttc', 'dfont', 'fon', 'fnt'
        ];
        throw new BadRequestException(
          `نوع ملف الخط غير مدعوم. الصيغ المدعومة: ${supportedExtensions.join(', ')}. ` +
          `نوع الملف المرسل: ${file.mimetype}, الامتداد: ${fileExtension}`
        );
      }

      if (file.size > 15 * 1024 * 1024) {
        throw new BadRequestException('حجم ملف الخط كبير جداً. الحد الأقصى 15MB');
      }

      const companyFontsPath = path.join(this.fontsBasePath, companyId);
      if (!fs.existsSync(companyFontsPath)) {
        fs.mkdirSync(companyFontsPath, { recursive: true });
      }

      const uniqueFileName = `${uuidv4()}-${Date.now()}.${fileExtension}`;
      const filePath = path.join(companyFontsPath, uniqueFileName);
      const fileUrl = `/uploads/fonts/${companyId}/${uniqueFileName}`;

      await fs.promises.writeFile(filePath, file.buffer);

      const detectedFontType = this.detectFontType(fileExtension);
      
     
      return { 
        fileName: uniqueFileName, 
        filePath, 
        fileUrl,
        mimeType: file.mimetype,
        fileSize: file.size,
        fontType: fontType || detectedFontType
      };

    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`فشل رفع الخط: ${errorMessage}`);
      
      if (this.isBadRequestException(error)) {
        throw error;
      }
      throw new InternalServerErrorException(`فشل رفع ملف الخط: ${errorMessage}`);
    }
  }

  async deleteFont(fileUrl: string): Promise<void> {
    try {
      const filePath = this.urlToFilePath(fileUrl);
      
      await fs.promises.access(filePath);
      
      await fs.promises.unlink(filePath);
      
      
      const dirPath = path.dirname(filePath);
      try {
        const files = await fs.promises.readdir(dirPath);
        if (files.length === 0) {
          await fs.promises.rmdir(dirPath);
        }
      } catch {
        // تجاهل خطأ المجلد غير الفارغ - تم إزالة المعلمة غير المستخدمة
      }
    } catch (error: unknown) {
      if (this.isFileNotFoundError(error)) {
        this.logger.warn(`الملف غير موجود: ${fileUrl}`);
        return;
      }
      
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`فشل حذف الخط: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حذف ملف الخط');
    }
  }

  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : 'ttf';
  }

  private urlToFilePath(fileUrl: string): string {
    const parts = fileUrl.split('/uploads/fonts/');
    if (parts.length !== 2) {
      throw new Error('رابط الملف غير صالح');
    }
    return path.join(this.fontsBasePath, parts[1]);
  }

  isFontFile(file: Express.Multer.File): boolean {
    const fileName = file.originalname || '';
    const extension = this.getFileExtension(fileName);
    
    const fontExtensions = [
      'ttf', 'otf', 'woff', 'woff2', 'eot', 'svg',
      'ttc', 'dfont', 'fon', 'fnt'
    ];
    
    const fontMimeTypes = [
      'font/ttf',
      'application/x-font-ttf',
      'application/x-font-truetype',
      
      'font/otf',
      'application/x-font-opentype',
      'font/opentype',
      
      'font/woff',
      'application/font-woff',
      'application/x-font-woff',
      
      'font/woff2',
      'application/font-woff2',
      'application/x-font-woff2',
      
      'application/vnd.ms-fontobject',
      'application/x-font-eot',
      
      'image/svg+xml',
      'font/svg',
      
      'application/octet-stream',
      'binary/octet-stream',
    ];
    
    return fontExtensions.includes(extension) || fontMimeTypes.includes(file.mimetype);
  }

  private detectFontType(extension: string): string {
    switch(extension) {
      case 'ttf':
      case 'ttc':
      case 'dfont':
      case 'fon':
      case 'fnt':
        return 'ttf';
      case 'otf':
        return 'otf';
      case 'woff':
        return 'woff';
      case 'woff2':
        return 'woff2';
      case 'eot':
        return 'eot';
      case 'svg':
        return 'svg';
      default:
        return extension;
    }
  }

  getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      'ttf': 'font/ttf',
      'otf': 'font/otf',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'eot': 'application/vnd.ms-fontobject',
      'svg': 'image/svg+xml',
      'ttc': 'font/collection',
      'dfont': 'font/ttf',
      'fon': 'application/x-font-fon',
      'fnt': 'application/x-font-fnt',
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  private isFileNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const fsError = error as FileSystemError;
      return fsError.code === 'ENOENT';
    }
    return false;
  }

  private isBadRequestException(error: unknown): error is BadRequestException {
    return error instanceof BadRequestException;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
    return 'Unknown error occurred';
  }

  async fileExists(fileUrl: string): Promise<boolean> {
    try {
      const filePath = this.urlToFilePath(fileUrl);
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFontInfo(fileUrl: string): Promise<{
    exists: boolean;
    filePath: string;
    size?: number;
    mimeType?: string;
    extension?: string;
  }> {
    try {
      const filePath = this.urlToFilePath(fileUrl);
      
      await fs.promises.access(filePath);
      const stats = await fs.promises.stat(filePath);
      const extension = this.getFileExtension(filePath);
      
      return {
        exists: true,
        filePath,
        size: stats.size,
        mimeType: this.getMimeTypeFromExtension(extension),
        extension
      };
    } catch {
      return { exists: false, filePath: '' };
    }
  }

  validateFileSize(file: Express.Multer.File, maxSizeMB: number = 15): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }
}
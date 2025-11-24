import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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
    companyId: string
  ): Promise<{ fileName: string; filePath: string; fileUrl: string }> {
    try {
      const allowedFontTypes = [
        'font/ttf', 'font/otf', 'application/font-woff',
        'application/font-woff2', 'font/woff', 'font/woff2'
      ];

      if (!allowedFontTypes.includes(file.mimetype)) {
        throw new BadRequestException('نوع ملف الخط غير مدعوم. المسموح: TTF, OTF, WOFF, WOFF2');
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('حجم ملف الخط كبير جداً. الحد الأقصى 5MB');
      }

      const companyFontsPath = path.join(this.fontsBasePath, companyId);
      if (!fs.existsSync(companyFontsPath)) {
        fs.mkdirSync(companyFontsPath, { recursive: true });
      }

      const fileExtension = this.getFileExtension(file.originalname);
      const fileName = `${this.generateUniqueId()}.${fileExtension}`;
      const filePath = path.join(companyFontsPath, fileName);
      const fileUrl = `/uploads/fonts/${companyId}/${fileName}`;

      await fs.promises.writeFile(filePath, file.buffer);

      this.logger.log(`تم رفع الخط بنجاح: ${filePath}`);

      return { fileName, filePath, fileUrl };

    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`فشل رفع الخط: ${errorMessage}`);
      
      if (this.isBadRequestException(error)) {
        throw error;
      }
      throw new InternalServerErrorException('فشل رفع ملف الخط');
    }
  }

  async deleteFont(fileUrl: string): Promise<void> {
    try {
      const filePath = this.urlToFilePath(fileUrl);
      
      await fs.promises.access(filePath);
      
      await fs.promises.unlink(filePath);
      
      this.logger.log(`تم حذف الخط: ${filePath}`);
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
    return filename.split('.').pop()?.toLowerCase() || 'woff2';
  }

  private urlToFilePath(fileUrl: string): string {
    const parts = fileUrl.split('/uploads/fonts/');
    if (parts.length !== 2) {
      throw new Error('رابط الملف غير صالح');
    }
    return path.join(this.fontsBasePath, parts[1]);
  }

  private isFileNotFoundError(error: unknown): boolean {
    const fsError = error as FileSystemError;
    return fsError instanceof Error && fsError.code === 'ENOENT';
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

  private generateUniqueId(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${randomStr}`;
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '',
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY') ?? '',
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET') ?? '',
    });
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error)
      return String((error as { message?: unknown }).message);
    return JSON.stringify(error) || 'Unknown error';
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
    publicId?: string
  ): Promise<{ secure_url: string; public_id: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            const reason = this.extractErrorMessage(error);
            this.logger.error(` فشل رفع الصورة: ${reason}`);
            return reject(new Error(reason));
          }

          this.logger.log(` تم رفع الصورة: ${result.secure_url}`);
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    publicId?: string
  ): Promise<{ secure_url: string; public_id: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            const reason = this.extractErrorMessage(error);
            this.logger.error(` فشل رفع الصورة من buffer: ${reason}`);
            return reject(new Error(reason));
          }

          this.logger.log(`✅ تم رفع الصورة من buffer: ${result.secure_url}`);
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async uploadImageFromUrl(
    url: string,
    folder: string,
    publicId?: string
  ): Promise<{ secure_url: string; public_id: string }> {
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder,
        public_id: publicId,
        resource_type: 'image',
      });

      this.logger.log(` تم رفع الصورة من رابط: ${result.secure_url}`);
      return {
        secure_url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (error) {
      const reason = this.extractErrorMessage(error);
      this.logger.error(` فشل رفع الصورة من رابط: ${reason}`);
      throw new Error(`فشل رفع الصورة من الرابط: ${reason}`);
    }
  }
}

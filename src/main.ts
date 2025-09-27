import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import * as express from 'express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppDataSource } from './data-source'; // ✅ تأكد من المسار الصحيح

async function bootstrap() {
  // ✅ تهيئة الاتصال بقاعدة البيانات
  await AppDataSource.initialize();
  console.log('✅ Connected to DB');

  // ✅ طباعة الكيانات والـ metadata
  console.log('✅ الكيانات المحملة:', AppDataSource.options.entities);
  console.log('✅ Metadata:', AppDataSource.entityMetadatas.map(e => e.name));

  // ✅ اختبار الجداول الفعلية
  const queryRunner = AppDataSource.createQueryRunner();
  const tables = await queryRunner.getTables(['company']);
  console.log('📦 Tables:', tables.map(t => t.name));

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Employee API')
    .setDescription('توثيق كامل لنظام الموظفين')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

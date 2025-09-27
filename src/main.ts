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
  // ✅ طباعة الكيانات اللي TypeORM شايفها
  console.log('✅ الكيانات المحملة:', AppDataSource.options.entities);

  // ✅ تهيئة الاتصال بقاعدة البيانات
  await AppDataSource.initialize();

  // ✅ طباعة الـ metadata الفعلية
  console.log('✅ Metadata:', AppDataSource.entityMetadatas.map(e => e.name));

  const app = await NestFactory.create(AppModule);

  // ✅ تفعيل الـ ValidationPipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // ✅ السماح بالـ CORS
  app.enableCors();

  // ✅ خدمة ملفات الصور من مجلد uploads داخل frontend-test
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  // ✅ الفلاتر والـ interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ✅ إعداد Swagger
  const config = new DocumentBuilder()
    .setTitle('Employee API')
    .setDescription('توثيق كامل لنظام الموظفين')
    .setVersion('1.0')
    .addBearerAuth()
    .build();


    AppDataSource.initialize()
  .then(async () => {
    console.log('✅ Connected to DB');
    const queryRunner = AppDataSource.createQueryRunner();
    const tables = await queryRunner.getTables(['company']);
    console.log('📦 Tables:', tables);
  })
  .catch((err) => {
    console.error('❌ DB Error:', err);
  });


  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // ✅ تشغيل السيرفر
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

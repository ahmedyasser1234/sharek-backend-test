import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import * as express from 'express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppDataSource } from './data-source';
import { AdminService } from './admin/admin.service';

async function bootstrap() {
  await AppDataSource.initialize();

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Employee API')
    .setDescription('توثيق كامل لنظام الموظفيين')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.init();

  //  إنشاء الأدمن الأساسي
  const adminService = app.get(AdminService);
  await adminService.ensureDefaultAdmin();

  await app.listen(process.env.PORT ?? 3000);
  console.log(` Server is running on http://localhost:${process.env.PORT ?? 3000}`);
}

void bootstrap();

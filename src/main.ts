import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import * as express from 'express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AdminService } from './admin/admin.service';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const server = app.getHttpAdapter().getInstance() as express.Application;
  

  server.set('trust proxy', 1);
  


  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  app.enableCors({
    origin: [
      'http://89.116.39.168',
      'http://sharik-sa.com',
      'https://sharik-sa.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173'  
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Forwarded-For', 'X-Real-IP']
  });

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const size = req.headers['content-length'] || '0';
    
    const getRealIp = () => {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        const ipList = ips.split(',').map(ip => ip.trim());
        logger.debug(`📡 X-Forwarded-For: ${ipList.join(', ')}`);
        return ipList[0];
      }
      
      const realIp = req.headers['x-real-ip'];
      if (realIp) {
        const ip = Array.isArray(realIp) ? realIp[0] : realIp;
        logger.debug(`📡 X-Real-IP: ${ip}`);
        return ip;
      }
      
      logger.debug(`📡 req.ip: ${req.ip}`);
      return req.ip;
    };
    
    const clientIp = getRealIp();
    
    logger.verbose(`[Request] ${req.method} ${req.url} - Real IP: ${clientIp} - Proxy IP: ${req.ip} - Size: ${size} bytes`);
    
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') {
      logger.warn(`⚠️ Local IP detected: ${clientIp}`);
      logger.debug(`📋 All IP headers:`, {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'x-client-ip': req.headers['x-client-ip'],
        'req.ip': req.ip,
        'req.connection.remoteAddress': req.connection?.remoteAddress,
        'req.socket.remoteAddress': req.socket?.remoteAddress,
      });
    }
    
    Object.assign(req, { realClientIp: clientIp });
    
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Employee API')
    .setDescription('توثيق كامل لنظام الموظفيين')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  logger.log('📚 Swagger جاهز على /docs');

  const adminService = app.get(AdminService);
  await adminService.ensureDefaultAdmin();
  logger.log('👑 تم التأكد من وجود الأدمن الأساسي');

  const port = process.env.PORT ?? 3000;
  
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Server is running on http://localhost:${port}`);
  logger.log(`🌐 Accessible externally at http://89.116.39.168:${port}`);
  logger.log(`🔗 API Accessible at https://sharik-sa.com/api/`);
  logger.log(`✅ CORS enabled for all domains`);
  logger.log(`✅ Trust proxy enabled with value: 1`);
  logger.log(`✅ Nginx headers: X-Real-IP, X-Forwarded-For`);
}

void bootstrap();
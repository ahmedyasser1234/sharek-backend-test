import { Controller, Get, Res, Query, HttpException, HttpStatus , UseGuards  } from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';


@ApiTags('Backup')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('download')
  async downloadBackup(@Res() res: Response, @Query('method') method: string = 'simple') {
    try {
      let backupPath: string;

      if (method === 'pgdump') {
        backupPath = await this.backupService.createPgDumpBackup();
      } else {
        backupPath = await this.backupService.createBackup();
      }

      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(backupPath)}"`);
      
      const fileStream = fs.createReadStream(backupPath);
      fileStream.pipe(res);
      
      fileStream.on('end', () => {
        try {
          fs.unlinkSync(backupPath);
        } catch {
          console.log('Error deleting backup file');
        }
      });
      
      fileStream.on('error', () => {
        throw new HttpException('Error streaming backup file', HttpStatus.INTERNAL_SERVER_ERROR);
      });
      
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create backup', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats')
  async getBackupStats() {
    try {
      const stats = await this.backupService.getDatabaseStats();
      return {
        message: 'Database statistics',
        totalTables: Object.keys(stats).length,
        stats: stats,
        generatedAt: new Date().toISOString()
      };
    } catch {
      throw new HttpException(
        'Failed to get statistics', 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('page')
  getBackupPage(@Res() res: Response) {
    res.sendFile(path.join(process.cwd(), 'public', 'backup.html'));
  }
}
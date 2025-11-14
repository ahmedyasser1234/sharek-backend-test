import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  Patch,
  UnauthorizedException,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ManagerService } from './manager.service';
import { ManagerJwtGuard } from './auth/manager-jwt.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Company } from '../company/entities/company.entity';

@ApiTags('Manager')
@Controller('manager')
export class ManagerController {
  constructor(private readonly service: ManagerService) {}

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.service.refresh(body.refreshToken);
  }

  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول المدير' })
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @Post('logout')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل خروج المدير' })
  logout(@Body() body: { refreshToken?: string }) {
    const refreshToken = body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    return this.service.logout(refreshToken);
  }

  @Get('stats')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إحصائيات النظام' })
  getStats() {
    return this.service.getStats();
  }

  @Get('companies')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الشركات' })
  getCompanies() {
    return this.service.getAllCompaniesWithEmployeeCount();
  }

  @Patch('companies/:id/activate')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل شركة' })
  activateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, true);
  }

  @Patch('companies/:id/deactivate')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل شركة' })
  deactivateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, false);
  }

  @Put('companies/:id')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  updateCompany(@Param('id') id: string, @Body() dto: Partial<Company>) {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف شركة' })
  deleteCompany(@Param('id') id: string) {
    return this.service.deleteCompany(id);
  }

  @Get('employees/:companyId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض موظفي الشركة' })
  getEmployees(@Param('companyId') companyId: string) {
    return this.service.getEmployeesByCompany(companyId);
  }

  @Delete('employees/:id')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف موظف' })
  deleteEmployee(@Param('id') id: number) {
    return this.service.deleteEmployee(id);
  }

  @Get('subscriptions')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الاشتراكات' })
  getSubscriptions() {
    return this.service.getAllSubscriptions();
  }

  @Patch('subscriptions/:id/activate')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك' })
  activateSubscription(@Param('id') id: string) {
    return this.service.activateSubscription(id);
  }

  @Patch('subscriptions/:id/change-plan')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة الاشتراك (محظور للمدير)' })
  changePlan() {
    return this.service.changeSubscriptionPlan();
  }

  @Get('download-database')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحميل قاعدة البيانات (محظور للمدير)' })
  downloadDatabase() {
    throw new ForbiddenException('غير مسموح للمدير بتحميل قاعدة البيانات');
  }
}
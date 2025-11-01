import { Controller, Get, Param, Patch, Query, HttpStatus } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('admin')
  async getAdminNotifications() {
    const notifications = await this.notificationService.getAdminNotifications();
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب إشعارات الأدمن',
      data: notifications
    };
  }

  @Get('company/:companyId')
  async getCompanyNotifications(@Param('companyId') companyId: string) {
    const notifications = await this.notificationService.getCompanyNotifications(companyId);
    const unreadCount = await this.notificationService.getUnreadNotificationsCount(companyId, 'company');
    
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب إشعارات الشركة',
      data: {
        notifications,
        unreadCount
      }
    };
  }

  @Get('unread-count')
  async getUnreadCount(
    @Query('userId') userId: string,
    @Query('userType') userType: 'admin' | 'company'
  ) {
    const count = await this.notificationService.getUnreadNotificationsCount(userId, userType);
    return {
      statusCode: HttpStatus.OK,
      data: { count }
    };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    await this.notificationService.markAsRead(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديث حالة الإشعار'
    };
  }

  @Patch('mark-all-read')
  async markAllAsRead(
    @Query('userId') userId: string,
    @Query('userType') userType: 'admin' | 'company'
  ) {
    await this.notificationService.markAllAsRead(userId, userType);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديد جميع الإشعارات كمقروءة'
    };
  }

  @Get('test')
  async testNotification(@Query('companyId') companyId?: string) {
    await this.notificationService.sendTestNotification(companyId);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم إرسال إشعار تجريبي'
    };
  }
}
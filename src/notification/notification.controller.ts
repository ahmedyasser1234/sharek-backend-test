import { Controller, Get, Param, Patch, Query, HttpStatus , Delete } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Patch('admin/mark-all-read')
  async markAllAdminAsRead() {
    await this.notificationService.markAllAsRead('admin-system', 'admin');
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديد جميع إشعارات الأدمن كمقروءة'
    };
  }

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
  
   @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    await this.notificationService.deleteNotification(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم حذف الإشعار بنجاح'
    };
  }

  @Delete('user/all')
  async deleteAllUserNotifications(
    @Query('userId') userId: string,
    @Query('userType') userType: 'admin' | 'company'
  ) {
    const result = await this.notificationService.deleteAllUserNotifications(userId, userType);
    return {
      statusCode: HttpStatus.OK,
      message: `تم حذف ${result.deletedCount} إشعار`,
      data: result
    };
  }

  @Delete('user/read')
  async deleteReadNotifications(
    @Query('userId') userId: string,
    @Query('userType') userType: 'admin' | 'company'
  ) {
    const result = await this.notificationService.deleteReadNotifications(userId, userType);
    return {
      statusCode: HttpStatus.OK,
      message: `تم حذف ${result.deletedCount} إشعار مقروء`,
      data: result
    };
  }

  @Delete('cleanup/old')
  async deleteOldNotifications(@Query('days') days: number = 30) {
    const result = await this.notificationService.deleteOldNotifications(days);
    return {
      statusCode: HttpStatus.OK,
      message: `تم حذف ${result.deletedCount} إشعار أقدم من ${days} يوم`,
      data: result
    };
  }

}
import { ApiProperty } from '@nestjs/swagger';

export class CompanyWithEmployeeCountDto {
  @ApiProperty({ description: 'معرف الشركة' })
  id: string;

  @ApiProperty({ description: 'اسم الشركة' })
  name: string;

  @ApiProperty({ description: 'البريد الإلكتروني للشركة' })
  email: string;

  @ApiProperty({ description: 'هاتف الشركة' })
  phone: string;

  @ApiProperty({ description: 'حالة التفعيل' })
  isActive: boolean;

  @ApiProperty({ description: 'حالة التحقق' })
  isVerified: boolean;

  @ApiProperty({ description: 'حالة الاشتراك' })
  subscriptionStatus: string;

  @ApiProperty({ description: 'عدد الموظفين' })
  employeesCount: number;

  @ApiProperty({ description: 'المفعل بواسطة', required: false })
  activatedBy?: string;

  @ApiProperty({ description: 'نوع المفعل', required: false })
  activatorType?: string;

  @ApiProperty({ description: 'تاريخ الاشتراك', required: false })
  subscriptionDate?: Date;

  @ApiProperty({ description: 'اسم الخطة', required: false })
  planName?: string;
}
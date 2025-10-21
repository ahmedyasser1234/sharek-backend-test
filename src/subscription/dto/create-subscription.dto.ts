import { IsNumber, IsDateString , IsUUID} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class CreateSubscriptionDto {

  @ApiProperty({ example: 'plan-uuid', description: 'معرف الباقة' })
  @IsUUID()
  planId: string;

  @ApiProperty({ example: 99.99, description: 'سعر الباقة' })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 'company-uuid', description: 'معرف الشركة' })
  @IsUUID()
  companyId: string;

  @ApiProperty({ example: '2025-09-01', description: 'تاريخ بدء الاشتراك' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-12-01', description: 'تاريخ انتهاء الاشتراك' })
  @IsDateString()
  endDate: string;
}

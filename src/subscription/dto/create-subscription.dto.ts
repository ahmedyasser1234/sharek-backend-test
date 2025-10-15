import { IsString, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'Basic Plan', description: 'اسم الباقة' })
  @IsString()
  planName: string;

  @ApiProperty({ example: 99.99, description: 'سعر الباقة' })
  @IsNumber()
  price: number;

  @ApiProperty({ example: '2025-09-01', description: 'تاريخ بدء الاشتراك' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-12-01', description: 'تاريخ انتهاء الاشتراك' })
  @IsDateString()
  endDate: string;
}

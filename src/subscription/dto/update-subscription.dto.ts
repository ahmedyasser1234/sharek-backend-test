import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSubscriptionDto } from './create-subscription.dto';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @ApiPropertyOptional({ example: 'Premium Plan', description: 'اسم الباقة (اختياري)' })
  @IsOptional()
  @IsString()
  planName?: string;

  @ApiPropertyOptional({ example: 199.99, description: 'سعر الباقة (اختياري)' })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: '2025-10-01', description: 'تاريخ بدء الاشتراك (اختياري)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'تاريخ انتهاء الاشتراك (اختياري)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

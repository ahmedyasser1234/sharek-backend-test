import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @ApiPropertyOptional({ example: 'Premium Plan' })
  @IsOptional()
  @IsString()
  planName?: string;

  @ApiPropertyOptional({ example: 199.99 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: '2025-10-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

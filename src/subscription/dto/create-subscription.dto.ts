import { IsString, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'Basic Plan' })
  @IsString()
  planName: string;

  @ApiProperty({ example: 99.99 })
  @IsNumber()
  price: number;

  @ApiProperty({ example: '2025-09-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-12-01' })
  @IsDateString()
  endDate: string;
}

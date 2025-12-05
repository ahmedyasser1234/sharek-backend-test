import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AdminBankDto {
  @ApiProperty({ description: 'اسم البنك', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ description: 'رقم الحساب البنكي', required: false })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ description: 'رقم الآيبان', required: false })
  @IsOptional()
  @IsString()
  ibanNumber?: string;
}
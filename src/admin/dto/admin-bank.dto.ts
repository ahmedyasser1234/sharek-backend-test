import { ApiProperty } from '@nestjs/swagger';
import {  IsOptional, IsString, Length } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({
    description: 'اسم البنك',
    example: 'البنك الأهلي السعودي',
    required: true
  })
  @IsString()
  @Length(2, 100)
  bankName: string;

  @ApiProperty({
    description: 'رقم الحساب البنكي',
    example: '1234567890123',
    required: true
  })
  @IsString()
  @Length(10, 30)
  accountNumber: string;

  @ApiProperty({
    description: 'رقم IBAN',
    example: 'SA0380000000608010167519',
    required: true
  })
  @IsString()
  @Length(15, 34)
  ibanNumber: string;

}

export class UpdateBankAccountDto {
  @ApiProperty({
    description: 'اسم البنك',
    example: 'البنك الأهلي السعودي',
    required: false
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  bankName?: string;

  @ApiProperty({
    description: 'رقم الحساب البنكي',
    example: '1234567890123',
    required: false
  })
  @IsOptional()
  @IsString()
  @Length(10, 30)
  accountNumber?: string;

  @ApiProperty({
    description: 'رقم IBAN',
    example: 'SA0380000000608010167519',
    required: false
  })
  @IsOptional()
  @IsString()
  @Length(15, 34)
  ibanNumber?: string;


}
import { IsEmail, IsNotEmpty, MinLength, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'admin@company.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'شركة التقنية الحديثة' })
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'securePassword123' })
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: '01012345678' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'شركة متخصصة في حلول البرمجيات' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Cairo, sans-serif' })
  @IsOptional()
  fontFamily?: string;
}

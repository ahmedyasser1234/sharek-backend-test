import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'admin@company.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'شركة التقنية الحديثة' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'securePassword123' })
  @IsOptional()
  @MinLength(6)
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: '01012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'شركة متخصصة في حلول البرمجيات' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Cairo, sans-serif' })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({ example: 'MyCustomFont' })
  @IsOptional()
  @IsString()
  customFontName?: string;

  @ApiPropertyOptional() 
  @IsOptional()
  @IsString()
  customFontUrl?: string; 

}
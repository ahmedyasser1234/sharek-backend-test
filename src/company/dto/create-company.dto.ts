import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
  GITHUB = 'github',
  FACEBOOK = 'facebook',
}

export class CreateCompanyDto {
  @ApiProperty({ example: 'admin@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'شركة التقنية الحديثة' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'securePassword123' })
  @MinLength(6)
  @IsString()
  password: string;

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

  @ApiPropertyOptional({ example: 'email', enum: AuthProvider })
  @IsOptional()
  @IsEnum(AuthProvider)
  provider?: AuthProvider;

  @ApiPropertyOptional({ example: 'Cairo, sans-serif' })
  @IsOptional()
  @IsString()
  fontFamily?: string;
}

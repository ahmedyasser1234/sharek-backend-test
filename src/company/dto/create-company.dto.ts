import { IsEmail, IsNotEmpty, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'admin@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'شركة التقنية الحديثة' })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'securePassword123' })
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: '01012345678' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'شركة متخصصة في حلول البرمجيات' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'email', enum: ['email', 'google', 'github', 'facebook'] })
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ example: 'Cairo, sans-serif' })
  @IsOptional()
  fontFamily?: string;
}

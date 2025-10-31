import { ApiProperty } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'شركة التقنية الحديثة' })
  name: string;

  @ApiProperty({ example: 'admin@company.com' })
  email: string;

  @ApiProperty({ example: '01012345678' })
  phone?: string;

  @ApiProperty({ example: 'https://example.com/logo.png' })
  logoUrl?: string;

  @ApiProperty({ example: 'شركة متخصصة في حلول البرمجيات' })
  description?: string;

  @ApiProperty({ example: 'active' })
  subscriptionStatus: string;

  @ApiProperty({ example: 'Cairo, sans-serif' })
  fontFamily?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiProperty({ example: 'email' })
  provider: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
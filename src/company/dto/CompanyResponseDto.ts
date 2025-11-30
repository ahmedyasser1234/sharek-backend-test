import { ApiProperty } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ nullable: true })
  logoUrl?: string;

  @ApiProperty({ nullable: true })
  description?: string;

  @ApiProperty()
  subscriptionStatus: string;

  @ApiProperty()
  fontFamily: string;

  @ApiProperty({ nullable: true })
  customFontUrl?: string;

  @ApiProperty({ nullable: true })
  customFontName?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty()
  provider: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
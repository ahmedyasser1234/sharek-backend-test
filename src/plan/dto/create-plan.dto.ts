import { IsString, IsNumber, IsBoolean, IsOptional, IsInt, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price: number;

  @IsInt()
  @Min(1)
  maxEmployees: number;

  @IsInt()
  @Min(1)
  durationInDays: number;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @IsOptional()
  @IsString()
  paypalPlanId?: string;
}

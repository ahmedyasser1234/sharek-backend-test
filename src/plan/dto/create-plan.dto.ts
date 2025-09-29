import { IsEnum, IsOptional, IsString, IsNumber, IsInt, Min, IsBoolean } from 'class-validator';
import { PaymentProvider } from '../../payment/payment-provider.enum';

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
  @IsEnum(PaymentProvider)
  paymentProvider?: PaymentProvider;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @IsOptional()
  @IsString()
  paypalPlanId?: string;

  @IsOptional()
  @IsString()
  saudiGatewayPlanId?: string;

  @IsOptional()
  @IsString()
  hyperpayPlanId?: string;

  @IsOptional()
  @IsString()
  paytabsPlanId?: string;

  @IsOptional()
  @IsString()
  tapPlanId?: string;

  @IsOptional()
  @IsString()
  stcpayPlanId?: string;

  @IsOptional()
  @IsString()
  geideaPlanId?: string;
}

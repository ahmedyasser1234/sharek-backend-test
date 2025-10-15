import { IsEnum, IsOptional, IsString, IsNumber, IsInt, Min, IsBoolean } from 'class-validator';
import { PaymentProvider } from '../../payment/payment-provider.enum';

export class CreatePlanDto {
  @IsString()
  readonly name: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsNumber()
  readonly price: number;

  @IsInt()
  @Min(1)
  readonly maxEmployees: number;

  @IsInt()
  @Min(1)
  readonly durationInDays: number;

  @IsOptional()
  @IsBoolean()
  readonly isTrial?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;

  @IsOptional()
  @IsEnum(PaymentProvider)
  readonly paymentProvider?: PaymentProvider;

  @IsOptional()
  @IsString()
  readonly currency?: string;

  @IsOptional()
  @IsString()
  readonly stripePriceId?: string;

  @IsOptional()
  @IsString()
  readonly paypalPlanId?: string;

  @IsOptional()
  @IsString()
  readonly saudiGatewayPlanId?: string;

  @IsOptional()
  @IsString()
  readonly hyperpayPlanId?: string;

  @IsOptional()
  @IsString()
  readonly paytabsPlanId?: string;

  @IsOptional()
  @IsString()
  readonly tapPlanId?: string;

  @IsOptional()
  @IsString()
  readonly stcpayPlanId?: string;

  @IsOptional()
  @IsString()
  readonly geideaPlanId?: string;
}

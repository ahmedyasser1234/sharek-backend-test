import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PaymentProvider } from '../payment/payment-provider.enum'; 
import { PaymentTransaction } from '../payment/entities/payment-transaction.entity';

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
      @InjectRepository(PaymentTransaction)
  
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

  async findAll(): Promise<Plan[]> {
    try {
      return await this.planRepo.find({ order: { createdAt: 'DESC' } });
    } catch {
      throw new HttpException('فشل جلب الخطط', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOne(id: string): Promise<Plan> {
    try {
      const plan = await this.planRepo.findOne({ where: { id } });
      if (!plan) throw new NotFoundException('الخطة غير موجودة');
      return plan;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل جلب تفاصيل الخطة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async create(createPlanDto: CreatePlanDto): Promise<Plan> {
    try {
      const exists = await this.planRepo.findOne({ where: { name: createPlanDto.name } });
      if (exists) throw new BadRequestException('اسم الخطة مستخدم بالفعل');
      const planData = {
        ...createPlanDto,
        paymentProvider: createPlanDto.paymentProvider ?? PaymentProvider.MANUAL_TRANSFER,
      };

      const plan = this.planRepo.create(planData);
      return await this.planRepo.save(plan);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new HttpException('فشل إنشاء الخطة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async update(id: string, updatePlanDto: UpdatePlanDto): Promise<Plan> {
    try {
      const plan = await this.findOne(id);
      Object.assign(plan, updatePlanDto);
      return await this.planRepo.save(plan);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل تعديل الخطة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    try {
      const plan = await this.findOne(id);
      const hasTransactions = await this.transactionRepo.count({ where: { plan: { id } } });
      if (hasTransactions > 0) {
        throw new BadRequestException('لا يمكن حذف الخطة لأنها مرتبطة بمعاملات دفع');
      }

      await this.planRepo.remove(plan);
      return { message: 'تم حذف الخطة بنجاح' };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل حذف الخطة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async applyManualPaymentToAllPlans(): Promise<{ updated: number }> {
    try {
      const plans = await this.planRepo.find();
      const updatedPlans = plans.map(plan => {
        plan.paymentProvider = PaymentProvider.MANUAL_TRANSFER;
        return plan;
      });
      await this.planRepo.save(updatedPlans);
      return { updated: updatedPlans.length };
    } catch (err) {
      throw new HttpException('فشل تحديث الخطط القديمة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
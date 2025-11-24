import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivityTrackerService } from '../service/activity-tracker.service';

interface RequestWithUser {
  user?: {
    companyId?: string;
    role?: string;
  };
  method: string;
  url: string;
}

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);

  constructor(private readonly activityTracker: ActivityTrackerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    
    return next.handle().pipe(
      tap(() => {
        if (request.user?.companyId) {
          const companyId = request.user.companyId;
          const action = `${request.method} ${request.url}`;
          
          this.activityTracker.recordActivity(companyId, action)
            .catch((err: Error) => 
              this.logger.error(` فشل تسجيل النشاط في الإنترسيبتور: ${err.message}`)
            );
        }
      })
    );
  }
}
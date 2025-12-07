// src/subscription/interfaces/subscription-debug.interface.ts
export interface SubscriptionDebugInfo {
  companyId: string;
  currentSubscription: {
    planId: string;
    planName: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
  } | null;
  subscriptionHistory: Array<{
    planId: string;
    planName: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
  }>;
  validation: {
    hasActiveSubscription: boolean;
    daysUntilExpiry: number | null;
    canRenew: boolean;
    canUpgrade: boolean;
    canDowngrade: boolean;
  };
  issues: string[];
  recommendations: string[];
}
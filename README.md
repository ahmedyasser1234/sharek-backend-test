
<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).




      .leftJoinAndSelect('subscription.plan', 'plan')
      .leftJoinAndSelect('company.tokens', 'token')
      .leftJoinAndSelect('company.loginLogs', 'log')





// hooks/useNotifications.ts
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: Date;
  isRead?: boolean;
  data?: any;
}

interface UseNotificationsProps {
  userType: 'admin' | 'company';
  userId?: string;
}

export const useNotifications = ({ userType, userId }: UseNotificationsProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      console.log(' جلب الإشعارات...', { userType, userId });
      
      let url = '';
      if (userType === 'admin') {
        url = '/api/notifications/admin';
      } else if (userType === 'company' && userId) {
        url = `/api/notifications/company/${userId}`;
      }

      if (url) {
        console.log(' جلب الإشعارات من:', url);
        const response = await fetch(url);
        const result = await response.json();
        
        console.log(' نتيجة جلب الإشعارات:', result);
        
        if (result.data) {
          if (userType === 'company' && result.data.notifications) {
            setNotifications(result.data.notifications);
            setUnreadCount(result.data.unreadCount || 0);
            console.log(` تم جلب ${result.data.notifications.length} إشعار للشركة`);
          } else {
            setNotifications(result.data);
            const unread = result.data.filter((n: Notification) => !n.isRead).length;
            setUnreadCount(unread);
            console.log(` تم جلب ${result.data.length} إشعار`);
          }
        }
      }
    } catch (error) {
      console.error(' فشل جلب الإشعارات:', error);
    }
  }, [userType, userId]);

  useEffect(() => {
    console.log(' تهيئة useNotifications:', { userType, userId });
    
    if (!userId && userType === 'company') {
      console.error(' userId مطلوب للشركة');
      return;
    }

    const newSocket = io('/notifications', {
      transports: ['websocket', 'polling']
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log(' متصل بالسوكيت - ID:', newSocket.id);
      setIsConnected(true);
      
      setTimeout(() => {
        if (userType === 'admin') {
          newSocket.emit('register_admin');
          console.log(' مسجل كأدمن');
        } else if (userType === 'company' && userId) {
          newSocket.emit('register_company', userId);
          console.log(` مسجل كشركة: ${userId}`);
        }
      }, 500);
    });

    newSocket.on('registration_success', (data) => {
      console.log(' تسجيل ناجح في السوكيت:', data.message);
    });

    newSocket.on('disconnect', () => {
      console.log(' انقطع الاتصال بالسوكيت');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error(' خطأ في الاتصال بالسوكيت:', error);
      setIsConnected(false);
    });

    const companyNotificationTypes = [
      'COMPANY_SUBSCRIPTION_APPROVED',
      'COMPANY_SUBSCRIPTION_REJECTED',
      'COMPANY_SUBSCRIPTION_EXTENDED',
      'COMPANY_SUBSCRIPTION_CANCELLED',
      'TEST_NOTIFICATION'
    ];

    const adminNotificationTypes = [
      'NEW_SUBSCRIPTION_REQUEST',
      'SUBSCRIPTION_APPROVED', 
      'SUBSCRIPTION_REJECTED',
      'PAYMENT_SUCCESS',
      'NEW_COMPANY_REGISTRATION',
      'TEST_NOTIFICATION'
    ];

    const notificationTypes = userType === 'admin' ? adminNotificationTypes : companyNotificationTypes;

    console.log(' يستمع لأنواع الإشعارات:', notificationTypes);

    notificationTypes.forEach(type => {
      newSocket.on(type, (data: Notification) => {
        console.log(` إشعار جديد [${type}]:`, data);
        
        setNotifications(prev => [data, ...prev]);
        setUnreadCount(prev => prev + 1);
        
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(data.title, {
            body: data.message,
            icon: '/logo.png',
            tag: data.id
          });
        }
      });
    });

    return () => {
      console.log(' تنظيف useNotifications');
      newSocket.disconnect();
    };
  }, [userType, userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('فشل تحديث الإشعار:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`/api/notifications/mark-all-read?userId=${userId || 'admin-system'}&userType=${userType}`, {
        method: 'PATCH'
      });
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, isRead: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('فشل تحديث جميع الإشعارات:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE'
      });
      
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => {
        const notification = notifications.find(n => n.id === notificationId);
        return notification && !notification.isRead ? Math.max(0, prev - 1) : prev;
      });
    } catch (error) {
      console.error('فشل حذف الإشعار:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications
  };
};


// components/NotificationBell.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';

interface NotificationBellProps {
  userType: 'admin' | 'company';
  userId?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ 
  userType, 
  userId 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotifications({ userType, userId });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 border-red-500';
      case 'medium': return 'bg-yellow-100 border-yellow-500';
      case 'low': return 'bg-blue-100 border-blue-500';
      default: return 'bg-gray-100 border-gray-500';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🔵';
      default: return '⚪';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* زر الجرس */}
      <button
        onClick={toggleDropdown}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none"
      >
        {/* أيقونة الجرس */}
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 17h5l-5 5v-5zM10.24 8.56a5.97 5.97 0 01-4.66-6.24M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>

        {/* علامة الإشعارات غير المقروءة */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}

        {/* مؤشر الاتصال */}
        <div className={`absolute -bottom-1 -left-1 w-3 h-3 rounded-full border-2 border-white ${
          isConnected ? 'bg-green-500' : 'bg-gray-400'
        }`} />
      </button>

      {/* dropdown الإشعارات */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          {/* الهيدر */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">الإشعارات</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    تعيين الكل كمقروء
                  </button>
                )}
                <span className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`} />
              </div>
            </div>
          </div>

          {/* قائمة الإشعارات */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                لا توجد إشعارات
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.slice(0, 10).map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.isRead ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <span className="text-lg">
                          {getPriorityIcon(notification.priority)}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {new Date(notification.timestamp).toLocaleTimeString('ar-EG')}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full border ${
                            getPriorityColor(notification.priority)
                          }`}>
                            {notification.priority === 'high' ? 'عالي' : 
                             notification.priority === 'medium' ? 'متوسط' : 'منخفض'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الفوتر */}
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <a
              href="/notifications"
              className="block text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              عرض جميع الإشعارات
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

// pages/admin/dashboard.tsx
import { NotificationBell } from '../../components/NotificationBell';
import { useAuth } from '../../contexts/AuthContext';

export const AdminDashboard = () => {
  const { user } = useAuth();

  const testCurrentCompanyNotification = async () => {
    if (!user?.id) {
      alert(' يرجى تسجيل الدخول أولاً');
      return;
    }

    try {
      const response = await fetch(`/api/notifications/test?companyId=${user.id}`, {
        method: 'GET'
      });
      const result = await response.json();
      
      if (response.ok) {
        console.log(` تم إرسال إشعار تجريبي للشركة الحالية: ${user.name}`);
        alert(` تم إرسال إشعار تجريبي للشركة الحالية: ${user.name}`);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error(' فشل إرسال إشعار تجريبي:', error);
      alert(' فشل إرسال الإشعار التجريبي');
    }
  };

  return (
    <div className="p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={testCurrentCompanyNotification}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
          >
            اختبار إشعار الشركة الحالية
          </button>
          <NotificationBell userType="admin" />
        </div>
      </header>

      {/* معلومات المستخدم */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">معلومات المسؤول</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p><strong>الاسم:</strong> {user?.name || 'غير محدد'}</p>
            <p><strong>البريد الإلكتروني:</strong> {user?.email || 'غير محدد'}</p>
          </div>
          <div>
            <p><strong>معرف المستخدم:</strong> {user?.id || 'غير محدد'}</p>
            <p><strong>نوع المستخدم:</strong> {user?.type || 'غير محدد'}</p>
          </div>
        </div>
      </div>

      {/* باقي محتوى الداشبورد */}
    </div>
  );
};

// pages/company/dashboard.tsx
import { NotificationBell } from '../../components/NotificationBell';
import { useAuth } from '../../contexts/AuthContext';

export const CompanyDashboard = () => {
  const { user } = useAuth();
  
  console.log(' user data:', user);
  
  return (
    <div className="p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">لوحة الشركة</h1>
        <NotificationBell userType="company" userId={user?.id} />
      </header>
      
      {/* إضافة معلومات التصحيح */}
      <div className="mb-4 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold mb-2">معلومات التصحيح:</h3>
        <p><strong>User ID:</strong> {user?.id || 'غير محدد'}</p>
        <p><strong>User Type:</strong> {user?.type || 'غير محدد'}</p>
      </div>
      
      {/* باقي محتوى الداشبورد */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">مرحباً بك في لوحة تحكم الشركة</h2>
        <p>هنا يمكنك إدارة اشتراكك ومشاهدة الإشعارات.</p>
      </div>
    </div>
  );
};


// pages/notifications.tsx
import React from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../contexts/AuthContext';

export const NotificationsPage = () => {
  const { user } = useAuth();
  
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotifications({
    userType: user?.type || 'company',
    userId: user?.id
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            تعيين الكل كمقروء ({unreadCount})
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow border">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-4 border-b hover:bg-gray-50 ${
              !notification.isRead ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{notification.title}</h3>
                <p className="text-gray-600 mt-1">{notification.message}</p>
                <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                  <span>{new Date(notification.timestamp).toLocaleString('ar-EG')}</span>
                  <span className={`px-2 py-1 rounded ${
                    notification.priority === 'high' ? 'bg-red-100 text-red-800' :
                    notification.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {notification.priority}
                  </span>
                </div>
              </div>
              
              <div className="flex space-x-2">
                {!notification.isRead && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    تعيين كمقروء
                  </button>
                )}
                <button
                  onClick={() => deleteNotification(notification.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  حذف
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};



// contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  type: 'admin' | 'company';
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};



// في الفرونت إند
const checkPlanChange = async (companyId, newPlanId) => {
  const response = await fetch(`/api/subscriptions/${companyId}/validate-plan-change/${newPlanId}`);
  const result = await response.json();
  
  if (result.canChange) {
    console.log('يمكن تغيير الخطة:', result.message);
  } else {
    console.log('لا يمكن تغيير الخطة:', result.message);
  }
};



git add .
git commit -m "update"
git push

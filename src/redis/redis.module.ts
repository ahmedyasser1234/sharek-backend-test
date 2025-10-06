import { Module } from '@nestjs/common';
import { createClient } from 'redis';

const redisClient = createClient({ url: 'redis://localhost:6379' });

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        await redisClient.connect();
        return redisClient;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}

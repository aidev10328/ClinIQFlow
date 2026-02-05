import { Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueuePublicController } from './queue-public.controller';
import { QueueService } from './queue.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [QueueController, QueuePublicController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ImportService } from './import.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [AdminController],
  providers: [ImportService],
})
export class AdminModule {}

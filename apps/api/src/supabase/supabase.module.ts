import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { SupabaseGuard } from './supabase.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseService, SupabaseGuard],
  exports: [SupabaseService, SupabaseGuard],
})
export class SupabaseModule {}

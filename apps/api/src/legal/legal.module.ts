import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { AgreementGateGuard } from './agreement-gate.guard';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [LegalController],
  providers: [
    LegalService,
    AgreementGateGuard, // Register as provider first
    // Register as global guard - runs after authentication guards
    {
      provide: APP_GUARD,
      useClass: AgreementGateGuard,
    },
  ],
  exports: [LegalService],
})
export class LegalModule {}

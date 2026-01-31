import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { FeatureGateGuard } from './feature-gate.guard';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ProductsController],
  providers: [ProductsService, FeatureGateGuard],
  exports: [ProductsService, FeatureGateGuard],
})
export class ProductsModule {}

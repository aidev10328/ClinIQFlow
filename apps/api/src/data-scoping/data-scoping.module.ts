import { Module } from '@nestjs/common';
import { DataScopingController } from './data-scoping.controller';
import { DataScopingService } from './data-scoping.service';
import { DataScopingMiddleware } from './data-scoping.middleware';

@Module({
  controllers: [DataScopingController],
  providers: [DataScopingService, DataScopingMiddleware],
  exports: [DataScopingService, DataScopingMiddleware],
})
export class DataScopingModule {}

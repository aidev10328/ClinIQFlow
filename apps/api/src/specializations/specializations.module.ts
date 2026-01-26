import { Module } from '@nestjs/common';
import { SpecializationsController } from './specializations.controller';

@Module({
  controllers: [SpecializationsController],
})
export class SpecializationsModule {}

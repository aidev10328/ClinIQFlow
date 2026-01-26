import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [MeController],
})
export class MeModule {}

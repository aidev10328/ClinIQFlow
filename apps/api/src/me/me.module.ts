import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { PrismaService } from '../prisma.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [MeController],
  providers: [PrismaService],
})
export class MeModule {}

import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentPublicController } from './appointment-public.controller';
import { AppointmentsService } from './appointments.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [AppointmentsController, AppointmentPublicController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}

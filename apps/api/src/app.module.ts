import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma.service';
import { N8nModule } from './providers/n8n';
import { WhatsAppModule } from './providers/whatsapp';
import { SupabaseModule } from './supabase';
import { MeModule } from './me/me.module';
import { InvitesModule } from './invites/invites.module';
import { StaffModule } from './staff/staff.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { LegalModule } from './legal/legal.module';
import { ProductsModule } from './products/products.module';
import { PatientsModule } from './patients/patients.module';
import { RbacModule } from './rbac/rbac.module';
import { AdminModule } from './admin/admin.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { QueueModule } from './queue/queue.module';
import { SpecializationsModule } from './specializations/specializations.module';
import { DataScopingModule } from './data-scoping/data-scoping.module';
import { DataScopingMiddleware } from './data-scoping/data-scoping.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    N8nModule,
    WhatsAppModule,
    SupabaseModule,
    MeModule,
    InvitesModule,
    StaffModule,
    HospitalsModule,
    LegalModule,
    ProductsModule,
    PatientsModule,
    RbacModule,
    AdminModule,
    DoctorsModule,
    AppointmentsModule,
    QueueModule,
    SpecializationsModule,
    DataScopingModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DataScopingMiddleware).forRoutes('*');
  }
}

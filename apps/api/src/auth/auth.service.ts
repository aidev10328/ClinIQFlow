import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { N8nService } from '../providers/n8n';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private n8nService: N8nService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = { sub: user.id, email: user.email };

    // Trigger n8n webhook for user login
    this.n8nService.onUserLoggedIn({ id: user.id, email: user.email });

    return {
      ok: true,
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async register(data: { email: string; password: string; firstName?: string; lastName?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });

    const { passwordHash: _, ...result } = user;

    // Trigger n8n webhook for user registration
    this.n8nService.onUserRegistered({
      id: result.id,
      email: result.email,
      firstName: result.firstName ?? undefined,
      lastName: result.lastName ?? undefined,
    });

    return this.login(result);
  }
}

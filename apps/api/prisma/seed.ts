import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ClinQflow database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@local' },
    update: {},
    create: {
      email: 'admin@local',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });

  console.log('Created admin user:', admin.email);

  // Add your seed data here
  // Example:
  // await prisma.post.create({
  //   data: {
  //     title: 'Welcome to ClinQflow',
  //     content: 'This is your first post.',
  //     authorId: admin.id,
  //   },
  // });

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

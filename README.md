# ClinQflow

Multi-tenant clinic scheduling + patient intake + AI-assisted ops workflow.

## Tech Stack

- **Frontend**: Next.js 13+ (App Router) with React 18
- **Backend**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with Bearer tokens
- **Styling**: Tailwind CSS

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- pnpm/npm

### Setup

1. **Install dependencies**
   ```bash
   npm install
   cd apps/api && npm install
   cd ../web && npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and JWT secret
   ```

3. **Setup database**
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. **Start development**
   ```bash
   npm run dev
   ```

   - API: http://localhost:4000
   - Web: http://localhost:3000

### Default Credentials

After seeding, you can login with:
- Email: `admin@local`
- Password: `admin123`

## Project Structure

```
clinqflow/
├── apps/
│   ├── api/                 # NestJS Backend
│   │   ├── src/
│   │   │   ├── auth/        # Authentication (JWT)
│   │   │   ├── common/      # Guards, decorators
│   │   │   ├── health/      # Health check endpoints
│   │   │   └── prisma.service.ts
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── seed.ts
│   └── web/                 # Next.js Frontend
│       ├── app/
│       │   ├── login/
│       │   └── (dashboard)/
│       ├── components/
│       └── lib/
├── .env.example
└── docker-compose.yml
```

## Adding Business Logic

This project is generated with all infrastructure pre-configured:
- Authentication & authorization
- Database schema & migrations
- API structure & validation
- Frontend routing & auth state

**To add your business logic:**

1. Add new Prisma models in `apps/api/prisma/schema.prisma`
2. Create NestJS modules in `apps/api/src/`
3. Add pages in `apps/web/app/`
4. Use Claude Code to help implement your features!

## License

Private - ClinQflow

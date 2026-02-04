# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy monorepo root package files
COPY package.json package-lock.json ./

# Copy API package.json for workspace install
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN npm ci --workspace=apps/api --include-workspace-root

# Copy prisma schema and generate client
COPY apps/api/prisma ./apps/api/prisma/
RUN cd apps/api && npx prisma generate

# Copy API source and build
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src/
RUN cd apps/api && npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy monorepo root package files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Install production deps only
RUN npm ci --workspace=apps/api --include-workspace-root --omit=dev

# Generate Prisma client
COPY apps/api/prisma ./apps/api/prisma/
RUN cd apps/api && npx prisma generate

# Copy built output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

EXPOSE 4005

CMD ["node", "dist/main.js"]

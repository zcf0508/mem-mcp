# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the app
RUN pnpm build

# Runtime stage - Caddy
FROM caddy:2-alpine

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create Caddyfile
RUN echo "[:3000] {\n  root * /app/dist\n  file_server\n  encode gzip\n}" > /etc/caddy/Caddyfile

# Expose port
EXPOSE 3000

# Run Caddy
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json ./

# Copy workspace manifests
COPY packages/backend/package.json ./packages/backend/
COPY packages/ai-agent/package.json ./packages/ai-agent/

# Install workspace deps (locked)
RUN npm ci

# Copy backend source
COPY packages/backend/ ./packages/backend/
COPY packages/ai-agent/ ./packages/ai-agent/

WORKDIR /app/packages/backend

# Build production artifacts so `npm run start` has a valid dist bundle
RUN npm run build --workspace @roc-job-radar/ai-agent && npm run build --workspace @roc-job-radar/backend

EXPOSE 3000

CMD ["npm", "run", "start"]

FROM node:22-alpine

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json ./

# Copy backend package manifest
COPY packages/backend/package.json ./packages/backend/

# Install backend workspace deps (locked)
RUN npm ci --workspace=packages/backend

# Copy backend source
COPY packages/backend/ ./packages/backend/

WORKDIR /app/packages/backend

# Build production artifacts so `npm run start` has a valid dist bundle
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

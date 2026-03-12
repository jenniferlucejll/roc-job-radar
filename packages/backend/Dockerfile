FROM node:22-alpine

WORKDIR /app

# Copy root workspace manifest
COPY package.json ./

# Copy backend package files
COPY packages/backend/package.json ./packages/backend/

# Install all workspace deps
RUN npm install --workspace=packages/backend

# Copy backend source
COPY packages/backend/ ./packages/backend/

WORKDIR /app/packages/backend

# Build production artifacts so `npm run start` has a valid dist bundle
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

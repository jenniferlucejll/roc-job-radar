# Stage 1: build the React app
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json ./

# Copy frontend package manifest
COPY packages/frontend/package.json ./packages/frontend/

# Install frontend workspace deps (locked)
RUN npm ci --workspace=packages/frontend

# Copy frontend source
COPY packages/frontend/ ./packages/frontend/

WORKDIR /app/packages/frontend

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

FROM node:22-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend

# Copy ONLY package files first for a clean install
COPY backend/package*.json ./
RUN npm install

# NOW copy the rest of the backend source
COPY backend/ ./
RUN npm run build

# --- Frontend Build ---
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Production Runtime ---
FROM node:22-alpine
RUN apk add --no-cache libstdc++
WORKDIR /app

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./
COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
# Build con Node 24 (incluye node:sqlite, sin compilación nativa)
FROM node:24-alpine AS builder
WORKDIR /app

# Backend
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Frontend
COPY web/package.json web/package-lock.json* ./web/
RUN npm install --prefix ./web
COPY web ./web
RUN npm run web:build

# Imagen final
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY package.json ./
RUN mkdir -p /app/data
EXPOSE 4000
VOLUME ["/app/data"]
CMD ["node", "dist/server.js"]
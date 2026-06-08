FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci
COPY . .
RUN npm run prisma:generate -w @trading/api && npm run build -w @trading/types && npm run build -w @trading/shared && npm run build -w @trading/api
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@trading/api"]

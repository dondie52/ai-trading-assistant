FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci
COPY . .
ENV NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
RUN npm run build -w @trading/types && npm run build -w @trading/shared && npm run build -w @trading/web
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@trading/web"]


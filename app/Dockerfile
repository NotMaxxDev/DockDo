FROM node:22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache python3 make g++ linux-headers
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY admin/package.json admin/
RUN npm ci
COPY shared shared
COPY app app
COPY admin admin
RUN npm run build -w @dockdo/shared && npm run build:server -w @dockdo/app && npm run build:web -w @dockdo/app

FROM node:22-alpine
WORKDIR /src
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY admin/package.json admin/
RUN npm ci --omit=dev
COPY --from=builder /src/shared/dist shared/dist
COPY --from=builder /src/app/dist app/dist
COPY --from=builder /src/app/web/dist app/web/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "app/dist/server/index.js"]

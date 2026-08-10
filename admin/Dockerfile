FROM node:22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache python3 make g++ linux-headers samba-client
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY admin/package.json admin/
RUN npm ci
COPY shared shared
COPY app app
COPY admin admin
RUN npm run build -w @dockdo/shared && npm run build:server -w @dockdo/admin && npm run build:web -w @dockdo/admin

FROM node:22-alpine
WORKDIR /src
RUN apk add --no-cache python3 make g++ samba-client
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY admin/package.json admin/
RUN npm ci --omit=dev
COPY shared shared
COPY app app
COPY admin admin
RUN rm -rf app/node_modules admin/node_modules shared/node_modules
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "admin/dist/server/index.js"]
FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules and Bun
RUN apk add --no-cache python3 make g++

RUN npm install -g bun

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["npx", "tsx", "index.ts"]

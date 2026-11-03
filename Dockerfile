FROM node:26-slim

WORKDIR /app

# Manifests first so the dependency layer is cached until a package.json changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .

# 5174 is the web UI, 8787 the API it proxies to.
EXPOSE 5174 8787
ENV VITE_HOST=0.0.0.0
CMD ["npm", "run", "dev"]

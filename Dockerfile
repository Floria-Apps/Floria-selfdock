# syntax=docker/dockerfile:1

# ---------- 1) build the dashboard (Vite) and the server (esbuild) ----------
# The output is plain JavaScript, so the build stages run natively on the build machine (no QEMU emulation),
# even when the target is arm64. This keeps multi-architecture builds fast.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# ---------- 2) production dependencies of the server only ----------
# None of them ships native code, so node_modules is the same on every architecture.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/server

# ---------- 3) final, small image ----------
FROM node:22-alpine
# The docker CLI and the compose plugin, used only by the stack editor's "Apply" actions (FLORIA_STACKS_APPLY=1).
RUN apk add --no-cache docker-cli docker-cli-compose
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]

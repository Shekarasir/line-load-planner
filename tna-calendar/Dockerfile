# ---- build the React client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: Express API + static client, SQLite on a volume ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/tna.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
# Runs as root so hosted volumes (Render/Railway disks are root-owned) are writable.
RUN mkdir -p /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]

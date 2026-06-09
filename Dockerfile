FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim

RUN addgroup --gid 1001 nodejs \
    && adduser --disabled-password --gecos "" --uid 1001 --gid 1001 nodejs

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN chmod +x docker-entrypoint.sh \
    && chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production
ENV PORT=3004
ENV SEED_ADMIN=true
ENV HOME=/tmp

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

EXPOSE 3004

ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]

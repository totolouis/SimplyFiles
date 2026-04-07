FROM node:20-alpine AS builder

ARG APP_VERSION=dev

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN APP_VERSION=${APP_VERSION} npm run build

# ── Production dependencies ──────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && \
    # pdf-parse bundles 4 versions of pdf.js (~29MB), keep only the one it uses
    find node_modules/pdf-parse/lib/pdf.js -mindepth 1 -maxdepth 1 ! -name 'v1.10.100' -exec rm -rf {} + 2>/dev/null; \
    # swagger-ui-dist is only used in dev mode (guarded by NODE_ENV check)
    rm -rf node_modules/swagger-ui-dist; \
    # typeorm ships browser/deno/expo drivers we don't need
    rm -rf node_modules/typeorm/browser; \
    # strip .md, .map, changelogs, licenses from all modules
    find node_modules \( -name '*.md' -o -name '*.map' -o -name 'CHANGELOG*' \
      -o -name 'LICENSE*' -o -name 'LICENCE*' -o -name '.npmignore' \) \
      -delete 2>/dev/null; \
    true

# ── Final image ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN mkdir -p /app/data/files

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# pdf-parse reads a test file at require-time unless this env var is set
ENV PDFJS_DISABLE_WORKER=true
ENV NODE_ENV=production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/main"]

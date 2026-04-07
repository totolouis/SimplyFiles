FROM node:20-alpine AS builder

ARG APP_VERSION=dev
ARG MAX_FOLDER_DEPTH=5

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN VITE_APP_VERSION=${APP_VERSION} \
    VITE_MAX_FOLDER_DEPTH=${MAX_FOLDER_DEPTH} \
    npm run build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

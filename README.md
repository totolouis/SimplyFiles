[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=totolouis_SimplyFiles&metric=alert_status&token=7cef024de13f6bb29dd47fa928f57c66265bef9e)](https://sonarcloud.io/summary/new_code?id=totolouis_SimplyFiles)

# SimplyFiles

A minimal, self-hosted file system with full-text content search. Fast, filesystem-first document explorer built with NestJS, React, and PostgreSQL.

## Features

- 📁 Nested folder management
- 📤 File upload (drag & drop or click)
- 👁️ File preview (images, PDF, text, video, audio)
- 🔍 Full-text content search (BM25 via PostgreSQL)
- 📥 File download
- 🐳 Docker Compose deployment

## Quick Start (Production)

The fastest way to run SimplyFiles using pre-built Docker Hub images (no login required):

### One-line setup:

```bash
mkdir -p ~/simplyfiles && cd ~/simplyfiles && wget https://raw.githubusercontent.com/totolouis/SimplyFiles/main/docker-compose.prod.yml -O docker-compose.yml && wget https://raw.githubusercontent.com/totolouis/SimplyFiles/main/.env.example -O .env
```

### Or step by step:

```bash
# 1. Create directory
mkdir ~/simplyfiles && cd ~/simplyfiles

# 2. Download compose file
wget https://raw.githubusercontent.com/totolouis/SimplyFiles/main/docker-compose.prod.yml -O docker-compose.yml

# 3. Download environment template
wget https://raw.githubusercontent.com/totolouis/SimplyFiles/main/.env.example -O .env

# 4. Edit .env with your settings
nano .env

# 5. Start the services
docker compose up -d
```

Then open: **http://localhost:23739**

The web UI runs on port `23739`, the API on port `3001`.

### Stop

```bash
cd ~/simplyfiles && docker compose down
```

### Update to latest version

```bash
cd ~/simplyfiles && docker compose pull && docker compose up -d
```

## Configuration

Create a `.env` file by copying `.env.example`. Here are all the available options:

### Database (PostgreSQL)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `simplyfiles` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `simplyfiles` | PostgreSQL password (change this!) |
| `POSTGRES_DB` | `simplyfiles` | PostgreSQL database name |

### Backend (NestJS API)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port (internal, don't change unless you know what you're doing) |
| `MAX_UPLOAD_SIZE` | `524288000` (500MB) | Maximum file upload size in bytes |
| `SEARCH_LANG` | `english` | PostgreSQL full-text search language. Supported: `english`, `french`, `german`, `spanish`, `italian`, etc. |
| `SEARCH_CHUNK_SIZE` | `1500` | Document indexing chunk size (characters). Larger = more accurate but slower search |
| `OCR_ENABLED` | `true` | Enable OCR for text extraction from images/PDFs (requires Tesseract) |
| `CORS_ORIGIN` | `http://localhost:23739` | Allowed CORS origin (should match your frontend URL) |

### Frontend (React)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_FOLDER_DEPTH` | `5` | Maximum nesting level for folders (UI restriction) |

### Deployment

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_VERSION` | `latest` | Docker image version tag to use |

## Development (Build from source)

### Prerequisites
- Docker & Docker Compose

### Run

```bash
docker compose up --build
```

Then open: **http://localhost:3000**

The API runs on port 3001, the web UI on port 3000.

### Backend (NestJS)

```bash
cd backend
npm install
# Set env vars (see .env.example or docker-compose.yml)
npm run start:dev
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:3001`.

## Architecture

```
Frontend (React + Vite) → Nginx → NestJS API → PostgreSQL (metadata + search)
→ Filesystem (binary files)
```

- Files are stored on disk by UUID, never in the database
- PostgreSQL `tsvector` + GIN index powers sub-50ms full-text search
- Only plain-text files are indexed (txt, md, csv, json, log, code files, etc.)

## File Preview Support

| Type | Preview |
|--------|----------------|
| Images | Inline `<img>` |
| PDF | `<iframe>` |
| Text | Rendered text |
| Video | `<video>` |
| Audio | `<audio>` |
| Others | Download only |

## Security Note

No authentication is included by design. Deploy behind a reverse proxy (Caddy, Traefik, nginx) on a private network or VPN for production use.

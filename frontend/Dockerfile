# Co-op frontend image: build the React app, serve it through nginx, and proxy
# /api/ to the `backend` service on the compose network.
#
# Two things here are load-bearing and were previously broken (the image could
# not be built at all, and the result would not have served the app):
#
#   1. This is a pnpm workspace (pnpm-lock.yaml at the repo root), so the build
#      context is the REPO ROOT, not frontend/, and `npm ci` is not usable —
#      there is no package-lock.json and npm would install a different tree.
#   2. nginx.conf must be copied into the image. Without it the stock nginx
#      config listens on :80, not :3000, and has no /api/ proxy at all.
#
# Build (from the repo root):
#   podman build -f frontend/Dockerfile \
#     --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_test_... -t coop-frontend .
# or simply `podman-compose up --build`, which passes the arg from your .env.

# Build stage — Node 22 matches the repo engines (>=22) and Vite 8's
# requirement (^20.19 || >=22.12).
FROM node:22-alpine AS builder
WORKDIR /app

# Same pnpm major as the repo pin in package.json ("packageManager").
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# husky's `prepare` script needs .git, which is not in the build context.
ENV HUSKY=0

# Manifests only, so dependency install caches independently of source edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile

COPY frontend ./frontend

# Baked into the bundle at build time (Vite inlines import.meta.env) — the
# served app has no environment of its own. envDir is the repo root, so these
# arrive as process env, not as a .env file.
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ARG VITE_API_URL=""
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} \
    VITE_API_URL=${VITE_API_URL}

# Fail the BUILD rather than ship a blank white screen: main.tsx throws without
# a publishable key, and the error is invisible in a browser console nobody
# opens.
RUN if [ -z "$VITE_CLERK_PUBLISHABLE_KEY" ]; then \
      echo "ERROR: --build-arg VITE_CLERK_PUBLISHABLE_KEY is required (pk_test_... from dashboard.clerk.com)."; \
      echo "       The app cannot boot without it; see docs/RUN_LOCAL.md section 4b."; \
      exit 1; \
    fi

RUN pnpm --filter ./frontend build

# Production stage
FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]

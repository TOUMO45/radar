# Radar API — Cloud Run deployment (hackathon submission, "get something
# real hosted" pass).
#
# pnpm/turborepo monorepo with internal `workspace:*` packages, so the whole
# workspace has to install/build together — this is intentionally a minimal-
# but-correct image (not size-optimized) to get one real, curlable hosted URL
# in place quickly. DRY_RUN mode: no GCP credentials required to start;
# ProvenancePort falls back to its DRY_RUN adapter automatically since the
# c2patool binary is not shipped in this image (see .dockerignore).
FROM node:22-slim AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Install first (better layer caching), full workspace so the lockfile matches.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Build only @scenelock/api and its real dependency graph (turbo filter).
RUN pnpm --filter @scenelock/api... build

FROM node:22-slim AS run
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo /repo
EXPOSE 8080
CMD ["node", "services/api/dist/server.js"]

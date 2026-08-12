# Build the GrowthBook Proxy app
FROM node:22-slim
WORKDIR /usr/local/src/app

RUN apt-get update && apt-get -y upgrade
# Install ca-certificates
RUN apt-get install -y ca-certificates && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy over minimum files to install dependencies
COPY package.json ./package.json
COPY pnpm-lock.yaml ./pnpm-lock.yaml
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY .npmrc ./.npmrc
COPY packages/apps/proxy/package.json ./packages/apps/proxy/package.json
COPY packages/lib/eval/package.json ./packages/lib/eval/package.json
# Pnpm install with dev dependencies
RUN pnpm install --frozen-lockfile --no-optional

# Build the proxy app and do a clean install with only production dependencies
COPY packages ./packages
RUN \
  pnpm build:proxy \
  && pnpm deploy --filter=@growthbook/proxy --prod /app/pruned


# Ship on a distroless Docker Hardened Image: continuously patched, no shell, no
# package manager, non-root uid 1000. ca-certificates ship in the base, so the
# stock apt-upgrade + ca-certificates install is gone. Building from source
# requires `docker login dhi.io` (free DHI Community tier); pulling needs no login.
FROM dhi.io/node:22-debian12
WORKDIR /app
COPY --from=0 /app/pruned/node_modules ./node_modules
COPY --from=0 /app/pruned/package.json ./package.json
COPY --from=0 /usr/local/src/app/packages/apps/proxy/dist ./dist
# Directory with build info (git commit sha, build date)
COPY buildinfo* ./buildinfo

# yarn/pnpm compat shim so deploy configs overriding the Docker CMD with
# `yarn start:with-tracing` or the README's documented `pnpm start:with-tracing`
# keep working now that neither yarn nor pnpm are shipped in this image.
COPY --chmod=755 bin/start-shim /usr/local/bin/yarn
COPY --chmod=755 bin/start-shim /usr/local/bin/pnpm

EXPOSE 3300
# Launch pm2-runtime via node directly: the .bin shim is a #!/bin/sh script, and
# pm2's own entry relies on #!/usr/bin/env node — neither can exec here, but pm2
# itself is plain Node.
CMD ["node", "node_modules/pm2/bin/pm2-runtime", "start", "dist/index.js"]

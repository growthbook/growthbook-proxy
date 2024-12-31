# Build the GrowthBook Proxy app
FROM node:18-slim
WORKDIR /usr/local/src/app

# Install ca-certificates
RUN apt-get update && \
  apt-get install -y ca-certificates && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

# Copy over minimum files to install dependencies
COPY package.json ./package.json
COPY yarn.lock ./yarn.lock
COPY packages/apps/proxy/package.json ./packages/apps/proxy/package.json
COPY packages/lib/eval/package.json ./packages/lib/eval/package.json
# Yarn install with dev dependencies
RUN yarn install --frozen-lockfile --ignore-optional

# Build the proxy app and do a clean install with only production dependencies
COPY packages ./packages
RUN \
  yarn build:proxy \
  && rm -rf node_modules \
  && rm -rf packages/apps/proxy/node_modules \
  && rm -rf packages/lib/eval/node_modules \
  && yarn install --frozen-lockfile --production=true --ignore-optional

# Directory with build info (git commit sha, build date)
COPY buildinfo* ./buildinfo

EXPOSE 3300
CMD ["yarn","start"]

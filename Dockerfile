FROM node:16-slim
WORKDIR /usr/local/src/app
# Yarn install with dev dependencies
COPY package.json ./package.json
COPY yarn.lock ./yarn.lock
RUN yarn install --frozen-lockfile --ignore-optional
# Build the app and do a clean install with only production dependencies
COPY src ./src
COPY tsconfig.json ./tsconfig.json
COPY .env ./.env
RUN \
  yarn build \
  && rm -rf node_modules \
  && yarn install --frozen-lockfile --production=true --ignore-optional

EXPOSE 3200
CMD ["yarn","start"]

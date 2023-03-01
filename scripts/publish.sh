#!/bin/bash

if [ ! -v NPM_TOKEN ]; then echo "NPM_TOKEN not set"; exit 1; fi;

npm set //registry.npmjs.org/:_authToken $NPM_TOKEN
yarn install
yarn build
yarn publish
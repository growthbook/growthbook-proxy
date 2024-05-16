# Default Starter Kit For TypeScript

[![Deploy to Fastly](https://deploy.edgecompute.app/button)](https://deploy.edgecompute.app/deploy)

Get to know the Fastly Compute environment with a basic starter that demonstrates routing, simple synthetic responses and code comments that cover common patterns.

**For more details about other starter kits for Compute, see the [Fastly Documentation Hub](https://www.fastly.com/documentation/solutions/starters)**

## Features
* Allow only requests with particular HTTP methods
* Match request URL path and methods for routing
* Build synthetic responses at the edge

## Understanding the code

This starter is intentionally lightweight, and requires no dependencies aside from the [`@fastly/js-compute`](https://www.npmjs.com/package/@fastly/js-compute) npm package. It will help you understand the basics of processing requests at the edge using Fastly. This starter includes implementations of common patterns explained in our [using Compute](https://www.fastly.com/documentation/guides/compute/javascript/) and [VCL migration](https://www.fastly.com/documentation/guides/compute/migrate/) guides.

The starter doesn't require the use of any backends. Once deployed, you will have a Fastly service running on Compute that can generate synthetic responses at the edge.

The template uses TypeScript to compile source files in `./src` into JS files in `./build`, which are then wrapped into `./bin/index.wasm` using the `js-compute-runtime` CLI tool bundled with the `@fastly/js-compute` npm package, and bundled into a `.tar.gz` file ready for deployment to Compute.

## Security issues

Please see our [SECURITY.md](SECURITY.md) for guidance on reporting security-related issues.

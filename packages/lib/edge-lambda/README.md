# Lambda@Edge App & SDK

[GrowthBook](https://www.growthbook.io) is a modular Feature Flagging and Experimentation platform.

The **GrowthBook Edge App** provides turnkey Visual Editor and URL Redirect experimentation on edge without any of the flicker associated with front-end experiments. It runs as a smart proxy layer between your application and your end users. It also can inject a fully-hydrated front-end SDK onto the rendered page, meaning no extra network requests needed.

- Automatically run server-side or hybrid Visual Experiments without redraw flicker.
- Automatically run server-side or hybrid URL Redirect Experiments without flicker or delay.
- Inject the JavaScript SDK with hydrated payload, allowing the front-end to pick up where the edge left off without any extra network requests.

### In this package

This package provides an implementation of our Edge App specific to AWS Lambda@Edge.

This package also exports utility methods for using our JavaScript SDK in a Lambda@Edge environment.

## References

- See the GrowthBook [Lambda@Edge docs](https://docs.growthbook.io/lib/edge/lambda) for full installation instructions.


- See the [base GrowthBook Edge App](../edge-utils) for a complete list of configuration environment variables

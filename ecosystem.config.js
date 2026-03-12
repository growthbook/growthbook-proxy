module.exports = {
  apps: [
    {
      name: "proxy",
      script: "dist/index.js",
      cwd: "./packages/apps/proxy",
      instances: 1,
      autorestart: process.env.PM2_AUTORESTART === "true",
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || "1G",
      ...(process.env.TRACING_ENABLED === "true" && {
        node_args: "--require ./packages/apps/proxy/dist/tracing.js",
      }),
    },
  ],
};

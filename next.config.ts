import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.css': {
          loaders: ['@tailwindcss/postcss'],
        },
      },
    },
  },
  // Ensure CSS is processed correctly
  webpack: (config: { experiments?: Record<string, unknown> }) => {
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };
    return config;
  },
};

export default nextConfig;

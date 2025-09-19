import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compiler options for production optimization
  compiler: {
    // Remove console logs in production (keeping error and warn)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },

  // React strict mode for better debugging
  reactStrictMode: true,

  // Disable powered by header for security
  poweredByHeader: false,

  // ESLint configuration - temporary to allow build with warnings
  eslint: {
    ignoreDuringBuilds: true, // TEMPORARY - Still has warnings to clean up
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.backblazeb2.com',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'maps.gstatic.com',
      }
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Environment variables that should be available on the client
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },

  // Webpack configuration for optimization
  webpack: (config, { isServer, dev }) => {
    // Production optimizations
    if (!dev && !isServer) {
      // Enable module concatenation for smaller bundles
      config.optimization = {
        ...config.optimization,
        concatenateModules: true,
        
        // Module IDs for better long-term caching
        moduleIds: 'deterministic',
      };
    }

    // Add bundle analyzer in development if requested
    if (process.env.ANALYZE === 'true') {
      const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: './analyze.html',
          openAnalyzer: true,
        })
      );
    }

    return config;
  },

  // Experimental features (validate against your Next.js version)
  experimental: {
    // Server Actions are stable in Next.js 14+
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Optimize package imports
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js'],
  },

  // Headers configuration for security and caching
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // Cache static assets
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Redirects for common routes
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/dashboard',
        permanent: true,
      },
    ];
  },

  // Output configuration
  output: 'standalone',
};

export default nextConfig;

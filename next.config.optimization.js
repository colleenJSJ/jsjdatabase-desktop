/**
 * Next.js optimization configuration for code splitting
 * Add these settings to your next.config.js
 */

module.exports = {
  // Enable SWC minification for better performance
  swcMinify: true,

  // Webpack configuration for code splitting
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side bundle optimization
      config.optimization = {
        ...config.optimization,
        
        // Enable module concatenation for smaller bundles
        concatenateModules: true,
        
        // Configure code splitting
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Vendor bundles
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name(module) {
                // Get package name
                const packageName = module.context.match(
                  /[\\/]node_modules[\\/](.*?)([\\/]|$)/
                )[1];
                
                // Group common packages together
                switch (packageName) {
                  // React ecosystem
                  case 'react':
                  case 'react-dom':
                  case 'react-is':
                  case 'scheduler':
                    return 'react';
                  
                  // Supabase
                  case '@supabase':
                  case 'supabase':
                    return 'supabase';
                  
                  // UI libraries
                  case 'lucide-react':
                  case 'class-variance-authority':
                  case 'clsx':
                  case 'tailwind-merge':
                    return 'ui';
                  
                  // Date utilities
                  case 'date-fns':
                  case 'dayjs':
                    return 'date';
                  
                  // Form/validation
                  case 'zod':
                  case 'react-hook-form':
                    return 'forms';
                  
                  // Data fetching
                  case '@tanstack/react-query':
                  case '@tanstack/query-core':
                    return 'query';
                  
                  // Virtualization
                  case 'react-window':
                  case 'react-window-infinite-loader':
                  case 'react-virtualized-auto-sizer':
                    return 'virtualization';
                  
                  // Charts
                  case 'recharts':
                  case 'd3':
                    return 'charts';
                  
                  // Default vendor bundle
                  default:
                    return 'vendor';
                }
              },
              priority: 10,
            },
            
            // Common components used across pages
            common: {
              name: 'common',
              minChunks: 3, // Used in 3+ pages
              priority: 5,
            },
            
            // Separate async components
            async: {
              test: /[\\/]components[\\/]lazy[\\/]/,
              name: 'async-components',
              priority: 8,
            },
          },
        },
        
        // Create runtime chunk for better caching
        runtimeChunk: {
          name: 'runtime',
        },
        
        // Module IDs for better long-term caching
        moduleIds: 'deterministic',
      };

      // Add bundle analyzer in development
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
    }

    return config;
  },

  // Experimental features for better performance
  experimental: {
    // Enable optimized fonts
    optimizeFonts: true,
    
    // Enable modern JS output for modern browsers
    modern: true,
    
    // Optimize CSS
    optimizeCss: true,
  },

  // Image optimization
  images: {
    domains: ['localhost', 'supabase.co'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Compression
  compress: true,

  // PoweredBy header
  poweredByHeader: false,

  // Strict mode for better debugging
  reactStrictMode: true,

  // Production browser source maps (optional, for debugging)
  productionBrowserSourceMaps: false,
};
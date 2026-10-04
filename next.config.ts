import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@google/genai', 'protobufjs'],
  allowedDevOrigins: ['*.run.app', '*.google.com', 'localhost:*'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
    webpackMemoryOptimizations: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    if (dev) {
      config.cache = false;
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      if (process.env.DISABLE_HMR === 'true') {
        config.watchOptions = {
          ignored: /.*/,
        };
      }
    }
    return config;
  },
};

export default nextConfig;

import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@google/genai', 'protobufjs'],
  allowedDevOrigins: [
    'ais-dev-umgoxrv5g7z5rprhf3yjnm-337117804073.us-east1.run.app',
    'ais-pre-umgoxrv5g7z5rprhf3yjnm-337117804073.us-east1.run.app',
    '*.us-east1.run.app',
    '*.run.app',
    '*.google.com',
    'localhost:*'
  ],
  experimental: {
    optimizePackageImports: ['lucide-react'],
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

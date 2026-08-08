import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@edupay/contracts', '@edupay/ui'],
};

export default nextConfig;

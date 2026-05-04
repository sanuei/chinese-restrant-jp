// @ts-check
import createNextIntlPlugin from 'next-intl/plugin';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      }
    ],
  },
};

export default withNextIntl(nextConfig);

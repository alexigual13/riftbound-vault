/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cmsassets.rgpub.io' },
      { protocol: 'https', hostname: 'images.scrydex.com' },
      { protocol: 'https', hostname: 'riftscribe.gg' },
      { protocol: 'https', hostname: 'tcgplayer-cdn.tcgplayer.com' },
      { protocol: 'https', hostname: 'product-images.tcgplayer.com' },
    ],
  },
  // Tesseract.js needs this to find its workers when bundled
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false }
    return config
  },
}

export default nextConfig

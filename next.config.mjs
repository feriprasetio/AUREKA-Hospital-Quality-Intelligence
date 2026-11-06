/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: process.env.FIGMA
    ? ''
    : process.env.AUREKA_BASE_PATH || '/AUREKA-Hospital-Quality-Intelligence',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig

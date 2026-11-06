/** @type {import('next').NextConfig} */
const basePath = process.env.FIGMA
  ? ''
  : process.env.AUREKA_BASE_PATH || '/AUREKA-Hospital-Quality-Intelligence'

const nextConfig = {
  output: 'export',
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig

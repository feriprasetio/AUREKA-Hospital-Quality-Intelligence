/** @type {import('next').NextConfig} */
const basePath = process.env.AUREKA_BASE_PATH ?? (
  process.env.NODE_ENV === 'development' || process.env.VERCEL || process.env.FIGMA
    ? ''
    : '/AUREKA-Hospital-Quality-Intelligence'
)

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

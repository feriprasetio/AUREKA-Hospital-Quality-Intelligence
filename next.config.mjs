/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/', destination: '/aureka.html' }]
  },
}

export default nextConfig

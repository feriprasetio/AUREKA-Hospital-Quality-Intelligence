/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Wajib untuk GitHub Pages (Static Export)
  basePath: '/AUREKA-Hospital-Quality-Intelligence', // Sesuaikan dengan nama repo Anda
  images: {
    unoptimized: true, // Wajib karena tidak ada server Node.js di GitHub Pages
  },
}

export default nextConfig
chore: configure next.js for github pages

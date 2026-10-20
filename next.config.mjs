/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors are validated strictly; do not ignore build errors
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

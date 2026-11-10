/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors are validated strictly; do not ignore build errors
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'

    // Content Security Policy:
    // - script-src: 'self' and 'unsafe-inline' are required for Next.js App Router client hydration bootstrap.
    //   'unsafe-eval' is enabled strictly in non-production environments for Turbopack/HMR.
    //   In production, 'unsafe-eval' is omitted to defend against dynamic string evaluation/XSS.
    //   https://va.vercel-scripts.com is allowlisted for optional @vercel/analytics.
    // - style-src: 'self' 'unsafe-inline' supports Tailwind CSS inline theme tokens and UI components.
    // - img-src: 'self' blob: data: supports SVG charting, canvas elements, and jsPDF client blob downloads.
    // - connect-src: 'self' and https://vitals.vercel-insights.com for internal API calls and Web Vitals telemetry.
    // - frame-ancestors: 'none' enforces anti-clickjacking at the CSP boundary.
    const scriptSrcDirectives = isProd
      ? "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com"
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com"

    const connectSrcDirectives = isProd
      ? "connect-src 'self' https://vitals.vercel-insights.com"
      : "connect-src 'self'"

    const cspDirectives = [
      "default-src 'self'",
      scriptSrcDirectives,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self' data:",
      connectSrcDirectives,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]

    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: cspDirectives.join('; '),
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
      },
      ...(isProd
        ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=63072000; includeSubDomains; preload',
            },
          ]
        : []),
    ]

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig

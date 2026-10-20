import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CloudFlow: Adaptive Serverless Scheduling for Cost Efficiency, Carbon Awareness, and SLA Compliance',
  description: 'Smarter Scheduling. Efficient Execution. Sustainable Cloud. Research-ready serverless scheduling framework.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8faf9',
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="antialiased">{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}

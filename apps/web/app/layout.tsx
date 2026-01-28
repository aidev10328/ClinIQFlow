import './globals.css';
import React from 'react';
import { Inter, Montserrat } from 'next/font/google';
import { AuthProvider } from '../components/AuthProvider';
import { RbacProvider } from '../lib/rbac/RbacContext';
import { ImpersonationProvider } from '../lib/ImpersonationContext';
import { QueryProvider } from '../lib/QueryProvider';
import Nav from '../components/Nav';
import ImpersonationBanner from '../components/ImpersonationBanner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata = {
  title: 'ClinQflow',
  description: 'Multi-tenant clinic scheduling + patient intake + AI-assisted ops workflow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="bg-background text-gray-900 font-sans">
        <QueryProvider>
        <AuthProvider>
          <ImpersonationProvider>
            <RbacProvider>
              <ImpersonationBanner />
              <div className="min-h-screen flex flex-col">
                <Nav />
                <main className="container py-8 flex-1">
                  {children}
                </main>
                <footer className="border-t border-gray-100 py-4">
                  <div className="container text-center text-sm text-gray-500">
                    Built with ClinQflow
                  </div>
                </footer>
              </div>
            </RbacProvider>
          </ImpersonationProvider>
        </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

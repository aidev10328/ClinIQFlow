import './globals.css';
import React from 'react';
import { AuthProvider } from '../components/AuthProvider';
import { RbacProvider } from '../lib/rbac/RbacContext';
import { ImpersonationProvider } from '../lib/ImpersonationContext';
import Nav from '../components/Nav';
import ImpersonationBanner from '../components/ImpersonationBanner';

export const metadata = {
  title: 'ClinQflow',
  description: 'Multi-tenant clinic scheduling + patient intake + AI-assisted ops workflow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&family=Dancing+Script:wght@700&family=Great+Vibes&family=Allura&family=Sacramento&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-gray-900 font-sans">
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
      </body>
    </html>
  );
}

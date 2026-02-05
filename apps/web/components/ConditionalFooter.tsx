'use client';

import { usePathname } from 'next/navigation';

export default function ConditionalFooter() {
  const pathname = usePathname();

  // Hide footer on pages that have their own layout
  const hide = pathname === '/login' || pathname.startsWith('/hospital') || pathname.startsWith('/admin') || pathname.startsWith('/doctor') || pathname.startsWith('/queue/status') || pathname.startsWith('/appointments/status');
  if (hide) return null;

  return (
    <footer className="border-t border-gray-100 py-4">
      <div className="container text-center text-sm text-gray-500">
        Built with ClinQflow
      </div>
    </footer>
  );
}

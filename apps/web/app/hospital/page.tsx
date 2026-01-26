'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HospitalPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/hospital/dashboard');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

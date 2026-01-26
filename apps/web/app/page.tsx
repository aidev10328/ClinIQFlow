'use client';

import { useAuth } from '../components/AuthProvider';
import Link from 'next/link';

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6">
      <div className="card p-5 sm:p-8">
        <h1 className="page-title text-2xl sm:text-3xl mb-3 sm:mb-4">
          Welcome to ClinQflow
        </h1>

        <p className="text-gray-600 mb-5 sm:mb-6 text-sm sm:text-base">
          Multi-tenant clinic scheduling + patient intake + AI-assisted ops workflow.
        </p>

        {user ? (
          <div className="space-y-4">
            <p className="text-accent text-sm sm:text-base">
              Logged in as <strong className="break-all">{user.email}</strong>
            </p>
            <Link
              href="/dashboard"
              className="btn-primary inline-block w-full sm:w-auto text-center"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm sm:text-base">
              Please sign in to continue.
            </p>
            <Link
              href="/login"
              className="btn-primary inline-block w-full sm:w-auto text-center"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="card p-5 sm:p-6">
          <h3 className="text-base sm:text-lg font-heading font-semibold text-gray-900 mb-2">Getting Started</h3>
          <p className="text-gray-600 text-xs sm:text-sm">
            This project was generated with BuildFlow. All infrastructure is pre-configured.
            Start adding your business logic!
          </p>
        </div>

        <div className="card p-5 sm:p-6">
          <h3 className="text-base sm:text-lg font-heading font-semibold text-gray-900 mb-2">Documentation</h3>
          <p className="text-gray-600 text-xs sm:text-sm">
            Check the README.md for setup instructions and project structure overview.
          </p>
        </div>
      </div>
    </div>
  );
}

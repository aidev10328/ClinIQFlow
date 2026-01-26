'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import ReactMarkdown from 'react-markdown';
import SignaturePad from '../../../components/SignaturePad';

// Types
interface LegalRequirement {
  docId: string;
  docType: string;
  title: string;
  region: string;
  version: string;
  effectiveAt: string;
  requiredForRole: string;
  status: 'PENDING' | 'ACCEPTED';
  acceptedAt?: string;
}

interface LegalDocument {
  docId: string;
  title: string;
  contentMarkdown: string;
  version: string;
  docType: string;
  region: string;
  effectiveAt: string;
}

export default function LegalAcceptPage() {
  const router = useRouter();
  const { user, session, profile, hospitals, currentHospitalId, setCurrentHospitalId, loading: authLoading } = useAuth();

  const [requirements, setRequirements] = useState<LegalRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Document viewer state
  const [viewingDoc, setViewingDoc] = useState<LegalDocument | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Acceptance form state
  const [acceptingDocId, setAcceptingDocId] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('type');
  const [acknowledged, setAcknowledged] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const currentHospital = hospitals.find(h => h.id === currentHospitalId);
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

  // Fetch requirements
  const fetchRequirements = useCallback(async () => {
    if (!session?.access_token || !currentHospitalId) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/v1/legal/requirements`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-hospital-id': currentHospitalId,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load requirements');
      }

      const data = await res.json();
      setRequirements(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, currentHospitalId, API_BASE]);

  // Initial load
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (!authLoading && user && !currentHospitalId && hospitals.length > 0) {
      // Need to select a hospital first
      router.push('/select-hospital?redirect=/legal/accept');
      return;
    }

    if (session?.access_token && currentHospitalId) {
      fetchRequirements();
    }
  }, [authLoading, user, session, currentHospitalId, hospitals, router, fetchRequirements]);

  // Check if all requirements accepted - redirect to dashboard
  useEffect(() => {
    if (!loading && requirements.length > 0) {
      const allAccepted = requirements.every(r => r.status === 'ACCEPTED');
      if (allAccepted) {
        router.push('/dashboard');
      }
    }
  }, [loading, requirements, router]);

  // View document
  const handleViewDocument = async (docId: string) => {
    if (!session?.access_token || !currentHospitalId) return;

    try {
      setLoadingDoc(true);
      const res = await fetch(`${API_BASE}/v1/legal/documents/${docId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-hospital-id': currentHospitalId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load document');
      }

      const doc = await res.json();
      setViewingDoc(doc);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDoc(false);
    }
  };

  // Accept document
  const handleAcceptDocument = async () => {
    if (!acceptingDocId || !session?.access_token || !currentHospitalId) return;

    if (!acknowledged) {
      setAcceptError('You must check the acknowledgment box');
      return;
    }

    // Validate signature based on mode
    if (signatureMode === 'type' && !signatureName.trim()) {
      setAcceptError('Please type your full legal name');
      return;
    }

    if (signatureMode === 'draw' && !signatureDataUrl) {
      setAcceptError('Please draw your signature');
      return;
    }

    try {
      setAccepting(true);
      setAcceptError(null);

      const res = await fetch(`${API_BASE}/v1/legal/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-hospital-id': currentHospitalId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          docId: acceptingDocId,
          signatureName: signatureName.trim(),
          signatureDataUrl: signatureDataUrl,
          signatureMode: signatureMode,
          acknowledged: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to accept document');
      }

      const updatedRequirements = await res.json();
      setRequirements(updatedRequirements);

      // Reset form
      setAcceptingDocId(null);
      setSignatureName('');
      setSignatureDataUrl(null);
      setSignatureMode('type');
      setAcknowledged(false);
      setViewingDoc(null);
    } catch (err: any) {
      setAcceptError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  // Start acceptance process
  const handleStartAccept = (docId: string) => {
    setAcceptingDocId(docId);
    setSignatureName('');
    setSignatureDataUrl(null);
    setSignatureMode('type');
    setAcknowledged(false);
    setAcceptError(null);
    handleViewDocument(docId);
  };

  // Handle signature change from SignaturePad
  const handleSignatureChange = (sig: { dataUrl: string | null; typedName: string; mode: 'draw' | 'type' }) => {
    setSignatureMode(sig.mode);
    setSignatureName(sig.typedName);
    setSignatureDataUrl(sig.dataUrl);
  };

  const pendingDocs = requirements.filter(r => r.status === 'PENDING');
  const acceptedDocs = requirements.filter(r => r.status === 'ACCEPTED');
  const progress = requirements.length > 0
    ? Math.round((acceptedDocs.length / requirements.length) * 100)
    : 0;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error && !requirements.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 max-w-md">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => fetchRequirements()}
            className="mt-4 btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Required Agreements</h1>
              <p className="text-gray-500">
                {currentHospital?.name || 'Hospital'} &bull; {profile?.email}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Progress</span>
              <span className="font-medium text-gray-900">{acceptedDocs.length} of {requirements.length} completed</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Document viewer modal */}
        {viewingDoc && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
              {/* Modal header */}
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{viewingDoc.title}</h2>
                  <p className="text-sm text-gray-500">
                    Version {viewingDoc.version} &bull; {viewingDoc.region} &bull; Effective {new Date(viewingDoc.effectiveAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setViewingDoc(null);
                    if (!acceptingDocId) {
                      setSignatureName('');
                      setAcknowledged(false);
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Document content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{viewingDoc.contentMarkdown}</ReactMarkdown>
                </div>
              </div>

              {/* Acceptance form (if in accept mode) */}
              {acceptingDocId === viewingDoc.docId && (
                <div className="px-6 py-4 border-t bg-gray-50">
                  {acceptError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                      {acceptError}
                    </div>
                  )}

                  <label className="flex items-start gap-3 mb-4">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-1 h-5 w-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">
                      I have read and understand this agreement. I agree to be bound by its terms and conditions.
                    </span>
                  </label>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sign Below
                    </label>
                    <SignaturePad
                      onSignatureChange={handleSignatureChange}
                      initialName={profile?.fullName || ''}
                      disabled={accepting}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setAcceptingDocId(null);
                        setViewingDoc(null);
                        setSignatureName('');
                        setSignatureDataUrl(null);
                        setSignatureMode('type');
                        setAcknowledged(false);
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAcceptDocument}
                      disabled={accepting || !acknowledged || (signatureMode === 'type' ? !signatureName.trim() : !signatureDataUrl)}
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {accepting ? 'Accepting...' : 'Accept & Sign'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending documents */}
        {pendingDocs.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Pending Agreements</h2>
              <p className="text-sm text-gray-500">Please review and accept the following documents to continue</p>
            </div>
            <div className="divide-y">
              {pendingDocs.map((req) => (
                <div key={req.docId} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{req.title}</h3>
                      <p className="text-sm text-gray-500">
                        {req.docType} &bull; {req.region} &bull; v{req.version}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewDocument(req.docId)}
                      disabled={loadingDoc}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleStartAccept(req.docId)}
                      disabled={loadingDoc}
                      className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted documents */}
        {acceptedDocs.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Completed</h2>
            </div>
            <div className="divide-y">
              {acceptedDocs.map((req) => (
                <div key={req.docId} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{req.title}</h3>
                      <p className="text-sm text-gray-500">
                        Accepted on {req.acceptedAt ? new Date(req.acceptedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewDocument(req.docId)}
                    disabled={loadingDoc}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No requirements (super admin or no role) */}
        {!loading && requirements.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Agreements Required</h2>
            <p className="text-gray-500 mb-4">
              You don&apos;t have any pending agreements for this hospital.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="btn-primary"
            >
              Continue to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

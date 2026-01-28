'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';

// Types
interface LegalDocument {
  id: string;
  doc_type: string;
  region: string;
  version: string;
  title: string;
  content_markdown: string;
  is_active: boolean;
  effective_at: string;
  created_at: string;
  updated_at: string;
}

interface AcceptanceStats {
  hospitalId: string;
  hospitalName: string;
  region: string;
  managerAcceptance: {
    required: number;
    accepted: number;
    percentage: number;
  };
  doctorAcceptance: {
    required: number;
    accepted: number;
    percentage: number;
  };
}

type TabType = 'documents' | 'stats' | 'create';

export default function AdminLegalPage() {
  const router = useRouter();
  const { user, session, profile, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('documents');
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [stats, setStats] = useState<AcceptanceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    docType: 'MSA',
    region: 'GLOBAL',
    version: '',
    title: '',
    contentMarkdown: '',
    isActive: true,
  });
  const [creating, setCreating] = useState(false);

  // Editing state
  const [editingDoc, setEditingDoc] = useState<LegalDocument | null>(null);
  const [updating, setUpdating] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(`${API_BASE}/v1/legal/admin/documents`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load documents');
      }

      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, [session?.access_token, API_BASE]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(`${API_BASE}/v1/legal/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load stats');
      }

      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, [session?.access_token, API_BASE]);

  // Initial load
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (!authLoading && profile && !profile.isSuperAdmin) {
      router.push('/dashboard');
      return;
    }

    if (session?.access_token && profile?.isSuperAdmin) {
      setLoading(true);
      Promise.all([fetchDocuments(), fetchStats()])
        .finally(() => setLoading(false));
    }
  }, [authLoading, user, session, profile, router, fetchDocuments, fetchStats]);

  // Create document
  const handleCreate = async () => {
    if (!session?.access_token) return;

    try {
      setCreating(true);
      setError(null);

      const res = await fetch(`${API_BASE}/v1/legal/admin/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createForm),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to create document');
      }

      setSuccessMessage('Document created successfully');
      setCreateForm({
        docType: 'MSA',
        region: 'GLOBAL',
        version: '',
        title: '',
        contentMarkdown: '',
        isActive: true,
      });
      setActiveTab('documents');
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Update document
  const handleUpdate = async () => {
    if (!session?.access_token || !editingDoc) return;

    try {
      setUpdating(true);
      setError(null);

      const res = await fetch(`${API_BASE}/v1/legal/admin/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editingDoc.title,
          contentMarkdown: editingDoc.content_markdown,
          isActive: editingDoc.is_active,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update document');
      }

      setSuccessMessage('Document updated successfully');
      setEditingDoc(null);
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  // Ensure all hospitals have required docs
  const handleEnsureAllDocs = async () => {
    if (!session?.access_token) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/v1/legal/admin/ensure-all-hospitals-docs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to ensure documents');
      }

      const data = await res.json();
      setSuccessMessage(`Processed ${data.processed} hospitals`);
      await fetchStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clone document for new version
  const handleCloneDocument = (doc: LegalDocument) => {
    // Increment version (simple logic: v1 -> v2, or append -new)
    let newVersion = doc.version;
    const match = doc.version.match(/^v(\d+)$/);
    if (match) {
      newVersion = `v${parseInt(match[1]) + 1}`;
    } else {
      newVersion = `${doc.version}-new`;
    }

    setCreateForm({
      docType: doc.doc_type as any,
      region: doc.region as any,
      version: newVersion,
      title: doc.title,
      contentMarkdown: doc.content_markdown,
      isActive: false, // New versions start inactive
    });
    setActiveTab('create');
  };

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  if (authLoading || loading) {
    return null;
  }

  if (!profile?.isSuperAdmin) {
    return null;
  }

  // Group documents by type and region
  const groupedDocs = documents.reduce((acc, doc) => {
    const key = `${doc.doc_type}-${doc.region}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(doc);
    return acc;
  }, {} as Record<string, LegalDocument[]>);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Legal Document Management</h1>
          <p className="text-gray-500">Manage agreements, DPAs, BAAs, and consent documents</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {successMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b flex">
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'documents'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Documents
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'stats'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Acceptance Stats
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'create'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Create New
            </button>
          </div>

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="p-6">
              {Object.entries(groupedDocs).map(([key, docs]) => (
                <div key={key} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    {key.replace('-', ' - ')}
                  </h3>
                  <div className="space-y-2">
                    {docs.sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime()).map((doc) => (
                      <div
                        key={doc.id}
                        className={`p-4 border rounded-lg ${
                          doc.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{doc.title}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                                {doc.version}
                              </span>
                              {doc.is_active ? (
                                <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-700">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-300 text-gray-600">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              Effective: {new Date(doc.effective_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingDoc(doc)}
                              className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleCloneDocument(doc)}
                              className="px-3 py-1.5 text-sm border border-primary-300 rounded text-primary-700 hover:bg-primary-50"
                            >
                              New Version
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {documents.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No documents found. Create one to get started.
                </div>
              )}
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Acceptance by Hospital</h3>
                <button
                  onClick={handleEnsureAllDocs}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Ensure All Hospitals Have Required Docs
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hospital</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Managers</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Doctors</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.map((stat) => (
                      <tr key={stat.hospitalId}>
                        <td className="px-4 py-3 text-sm text-gray-900">{stat.hospitalName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{stat.region}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm text-gray-600">
                              {stat.managerAcceptance.accepted}/{stat.managerAcceptance.required}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              stat.managerAcceptance.percentage === 100
                                ? 'bg-green-100 text-green-700'
                                : stat.managerAcceptance.percentage > 0
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {stat.managerAcceptance.percentage}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm text-gray-600">
                              {stat.doctorAcceptance.accepted}/{stat.doctorAcceptance.required}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              stat.doctorAcceptance.percentage === 100
                                ? 'bg-green-100 text-green-700'
                                : stat.doctorAcceptance.percentage > 0
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {stat.doctorAcceptance.percentage}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {stats.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No hospitals found.
                </div>
              )}
            </div>
          )}

          {/* Create Tab */}
          {activeTab === 'create' && (
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Document</h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                  <select
                    value={createForm.docType}
                    onChange={(e) => setCreateForm({ ...createForm, docType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="MSA">MSA (Master Service Agreement)</option>
                    <option value="DPA">DPA (Data Processing Agreement)</option>
                    <option value="BAA">BAA (Business Associate Agreement)</option>
                    <option value="DOCTOR_CONSENT">Doctor Consent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <select
                    value={createForm.region}
                    onChange={(e) => setCreateForm({ ...createForm, region: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="GLOBAL">Global</option>
                    <option value="US">US</option>
                    <option value="UK">UK</option>
                    <option value="IN">India</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input
                    type="text"
                    value={createForm.version}
                    onChange={(e) => setCreateForm({ ...createForm, version: e.target.value })}
                    placeholder="e.g., v1, 2026-01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    placeholder="Document title"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content (Markdown)
                </label>
                <textarea
                  value={createForm.contentMarkdown}
                  onChange={(e) => setCreateForm({ ...createForm, contentMarkdown: e.target.value })}
                  rows={15}
                  placeholder="# Document Title&#10;&#10;## Section 1&#10;&#10;Content here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createForm.isActive}
                    onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.checked })}
                    className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Active (users will be required to accept)</span>
                </label>
              </div>

              <button
                onClick={handleCreate}
                disabled={creating || !createForm.version || !createForm.title || !createForm.contentMarkdown}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Document'}
              </button>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editingDoc && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  Edit: {editingDoc.title}
                </h2>
                <button
                  onClick={() => setEditingDoc(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editingDoc.title}
                    onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Content (Markdown)
                  </label>
                  <textarea
                    value={editingDoc.content_markdown}
                    onChange={(e) => setEditingDoc({ ...editingDoc, content_markdown: e.target.value })}
                    rows={15}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  />
                </div>

                <div className="mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingDoc.is_active}
                      onChange={(e) => setEditingDoc({ ...editingDoc, is_active: e.target.checked })}
                      className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t flex justify-end gap-3">
                <button
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

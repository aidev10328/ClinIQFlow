'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader, Tabs, TabPanel, StatusBadge, Modal, LoadingState } from '../../../components/admin/ui';

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

export default function AdminCompliancePage() {
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
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
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Editing state
  const [editingDoc, setEditingDoc] = useState<LegalDocument | null>(null);
  const [updating, setUpdating] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

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
    if (session?.access_token) {
      setLoading(true);
      Promise.all([fetchDocuments(), fetchStats()])
        .finally(() => setLoading(false));
    }
  }, [session?.access_token, fetchDocuments, fetchStats]);

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
      setShowCreateModal(false);
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
      isActive: false,
    });
    setShowCreateModal(true);
  };

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Calculate overall compliance
  const overallCompliance = stats.length > 0
    ? Math.round(
        stats.reduce((sum, s) => sum + s.managerAcceptance.percentage + s.doctorAcceptance.percentage, 0) /
        (stats.length * 2)
      )
    : 0;

  const hospitalsFullyCompliant = stats.filter(
    s => s.managerAcceptance.percentage === 100 && s.doctorAcceptance.percentage === 100
  ).length;

  const hospitalsPending = stats.filter(
    s => s.managerAcceptance.percentage < 100 || s.doctorAcceptance.percentage < 100
  ).length;

  const tabItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents', count: documents.length },
    { id: 'hospitals', label: 'By Hospital', count: stats.length },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Compliance" subtitle="Legal document management and acceptance tracking" />
        <LoadingState type="cards" />
      </div>
    );
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
    <div>
      <PageHeader
        title="Compliance"
        subtitle="Legal document management and acceptance tracking"
        actions={
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            Create Document
          </button>
        }
      />

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {successMessage}
        </div>
      )}

      <Tabs tabs={tabItems} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      <TabPanel id="overview" activeTab={activeTab}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overall Compliance</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{overallCompliance}%</p>
            <div className="mt-2 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${overallCompliance === 100 ? 'bg-green-500' : overallCompliance > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${overallCompliance}%` }}
              />
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fully Compliant</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{hospitalsFullyCompliant}</p>
            <p className="text-xs text-gray-500 mt-1">hospitals</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{hospitalsPending}</p>
            <p className="text-xs text-gray-500 mt-1">hospitals need action</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Documents</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{documents.filter(d => d.is_active).length}</p>
            <p className="text-xs text-gray-500 mt-1">of {documents.length} total</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Hospitals Needing Attention</h3>
            <button
              onClick={handleEnsureAllDocs}
              className="text-xs px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)]"
            >
              Sync All Hospital Docs
            </button>
          </div>
          <div className="space-y-2">
            {stats.filter(s => s.managerAcceptance.percentage < 100 || s.doctorAcceptance.percentage < 100).slice(0, 5).map((stat) => (
              <div key={stat.hospitalId} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{stat.hospitalName}</p>
                  <p className="text-xs text-gray-500">{stat.region}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Managers</p>
                    <p className="text-sm font-medium">{stat.managerAcceptance.percentage}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Doctors</p>
                    <p className="text-sm font-medium">{stat.doctorAcceptance.percentage}%</p>
                  </div>
                </div>
              </div>
            ))}
            {stats.filter(s => s.managerAcceptance.percentage < 100 || s.doctorAcceptance.percentage < 100).length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-700">All hospitals are fully compliant</p>
              </div>
            )}
          </div>
        </div>
      </TabPanel>

      {/* Documents Tab */}
      <TabPanel id="documents" activeTab={activeTab}>
        <div className="bg-white rounded-lg border border-gray-100 p-5">
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
                          <StatusBadge status={doc.is_active ? 'active' : 'inactive'} size="sm" />
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
                          className="px-3 py-1.5 text-sm border border-[var(--color-primary)] rounded text-[var(--color-primary)] hover:bg-blue-50"
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
      </TabPanel>

      {/* Hospitals Tab */}
      <TabPanel id="hospitals" activeTab={activeTab}>
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hospital</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Managers</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Doctors</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.map((stat) => {
                const isComplete = stat.managerAcceptance.percentage === 100 && stat.doctorAcceptance.percentage === 100;
                return (
                  <tr key={stat.hospitalId}>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.hospitalName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{stat.region}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm text-gray-600">
                          {stat.managerAcceptance.accepted}/{stat.managerAcceptance.required}
                        </span>
                        <StatusBadge
                          status={stat.managerAcceptance.percentage === 100 ? 'complete' : 'pending'}
                          label={`${stat.managerAcceptance.percentage}%`}
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm text-gray-600">
                          {stat.doctorAcceptance.accepted}/{stat.doctorAcceptance.required}
                        </span>
                        <StatusBadge
                          status={stat.doctorAcceptance.percentage === 100 ? 'complete' : 'pending'}
                          label={`${stat.doctorAcceptance.percentage}%`}
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={isComplete ? 'complete' : 'pending'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {stats.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No hospitals found.
            </div>
          )}
        </div>
      </TabPanel>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Document"
        subtitle="Add a new legal document"
        size="lg"
        footer={
          <>
            <button
              onClick={() => setShowCreateModal(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !createForm.version || !createForm.title || !createForm.contentMarkdown}
              className="btn-primary"
            >
              {creating ? 'Creating...' : 'Create Document'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <select
              value={createForm.docType}
              onChange={(e) => setCreateForm({ ...createForm, docType: e.target.value })}
              className="input-field"
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
              className="input-field"
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
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="Document title"
              className="input-field"
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
            rows={10}
            placeholder="# Document Title&#10;&#10;## Section 1&#10;&#10;Content here..."
            className="input-field font-mono text-sm"
          />
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={createForm.isActive}
              onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.checked })}
              className="h-4 w-4 text-[var(--color-primary)] rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Active (users will be required to accept)</span>
          </label>
        </div>
      </Modal>

      {/* Edit Modal */}
      {editingDoc && (
        <Modal
          isOpen={!!editingDoc}
          onClose={() => setEditingDoc(null)}
          title={`Edit: ${editingDoc.title}`}
          size="lg"
          footer={
            <>
              <button
                onClick={() => setEditingDoc(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="btn-primary"
              >
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          }
        >
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={editingDoc.title}
              onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content (Markdown)
            </label>
            <textarea
              value={editingDoc.content_markdown}
              onChange={(e) => setEditingDoc({ ...editingDoc, content_markdown: e.target.value })}
              rows={12}
              className="input-field font-mono text-sm"
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingDoc.is_active}
                onChange={(e) => setEditingDoc({ ...editingDoc, is_active: e.target.checked })}
                className="h-4 w-4 text-[var(--color-primary)] rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

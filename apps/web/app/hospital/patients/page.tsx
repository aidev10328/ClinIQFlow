'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';

const ROWS_PER_PAGE = 10;

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  insuranceProvider?: string;
  insuranceNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

function calculateAge(dateOfBirth?: string, now?: Date): string {
  if (!dateOfBirth) return '—';
  const today = now || new Date();
  const birth = new Date(dateOfBirth + 'T00:00:00');
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age.toString();
}

function PatientsPageContent() {
  const searchParams = useSearchParams();
  const { currentHospital } = useAuth();
  const { getCurrentTime } = useHospitalTimezone();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState<Partial<Patient>>({
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '',
    address: '', city: '', state: '', postalCode: '', insuranceProvider: '', insuranceNumber: '',
    emergencyContactName: '', emergencyContactPhone: '', notes: '', status: 'active',
  });

  // Auto-dismiss banners
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 10000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    fetchPatients();
    if (searchParams.get('action') === 'add') setShowModal(true);
  }, [searchParams]);

  async function fetchPatients() {
    try {
      const res = await apiFetch('/v1/patients');
      if (res.ok) {
        setPatients(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setDataLoaded(true);
    }
  }

  function resetForm() {
    setFormData({
      firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '',
      address: '', city: '', state: '', postalCode: '', insuranceProvider: '', insuranceNumber: '',
      emergencyContactName: '', emergencyContactPhone: '', notes: '', status: 'active',
    });
    setEditingPatient(null);
    setFormError('');
  }

  function handleEdit(patient: Patient) {
    setEditingPatient(patient);
    setFormData({ ...patient });
    setFormError('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const url = editingPatient ? `/v1/patients/${editingPatient.id}` : '/v1/patients';
      const method = editingPatient ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(formData) });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchPatients();
        setMessage({ type: 'success', text: editingPatient ? 'Patient updated' : 'Patient added' });
      } else {
        const error = await res.json();
        setFormError(error.message || 'Failed to save patient');
      }
    } catch {
      setFormError('Failed to save patient');
    } finally {
      setSaving(false);
    }
  }

  // Filter patients
  const filteredPatients = patients.filter(patient => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const queryDigits = searchQuery.replace(/\D/g, '');
    const phoneDigits = (patient.phone || '').replace(/\D/g, '');
    return fullName.includes(query) ||
      patient.email?.toLowerCase().includes(query) ||
      (queryDigits.length > 0 && phoneDigits.includes(queryDigits));
  });

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / ROWS_PER_PAGE));
  const pagedPatients = filteredPatients.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  // Stats
  const activePatients = patients.filter(p => p.status === 'active').length;

  // Helper components (matching Doctors page)
  const Pagination = ({ page, totalPages: tp, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) => tp <= 1 ? null : (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 bg-slate-50/50 shrink-0">
      <span className="text-[10px] text-slate-400">Page {page} of {tp}</span>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-0.5 text-[10px] rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
        <button onClick={() => setPage(Math.min(tp, page + 1))} disabled={page >= tp} className="px-2 py-0.5 text-[10px] rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );

  const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <div className="relative">
      <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pl-7 pr-2 py-1 text-[10px] border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#a3cbef] w-40" />
    </div>
  );

  const TableSkeleton = ({ cols, rows = 3 }: { cols: number; rows?: number }) => (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-1.5"><div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );

  return (
    <div className="page-fullheight flex flex-col overflow-auto lg:overflow-hidden p-2 gap-1">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-sm font-semibold text-slate-800">Patients</h1>
      </div>

      {/* Patients Table */}
      <div className="flex-1 lg:min-h-0 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold text-slate-800">Patients</h3>
            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-medium rounded">{activePatients} active</span>
            <SearchInput value={searchQuery} onChange={v => { setSearchQuery(v); setCurrentPage(1); }} placeholder="Search patients..." />
            {message && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${message.type === 'success' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>{message.text}</span>
            )}
          </div>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Add Patient</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {!dataLoaded ? (
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Patient</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Phone</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Email</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Age</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Gender</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <TableSkeleton cols={7} rows={3} />
            </table>
          ) : pagedPatients.length > 0 ? (
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Patient</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Phone</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Email</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Age</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Gender</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedPatients.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-slate-700">{p.firstName} {p.lastName}</div>
                          {p.email && <div className="text-[10px] text-slate-400 sm:hidden">{p.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{p.phone || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{p.email || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{calculateAge(p.dateOfBirth, getCurrentTime())}</td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell capitalize">{p.gender || '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {p.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => handleEdit(p)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                        <button onClick={() => window.location.href = `/hospital/appointments`} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Appointments</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="text-xs text-slate-500">{searchQuery ? 'No patients match your search' : 'No patients yet'}</p>
              <p className="text-[10px] text-slate-400">{searchQuery ? 'Try a different search' : 'Add patients to get started'}</p>
            </div>
          )}
        </div>
        <Pagination page={currentPage} totalPages={totalPages} setPage={setCurrentPage} />
      </div>

      {/* Add/Edit Patient Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{editingPatient ? 'Edit Patient' : 'Add New Patient'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{editingPatient ? `${editingPatient.firstName} ${editingPatient.lastName}` : 'Register a new patient'}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
              {formError && (
                <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
                  <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-6">
                {/* Column 1: Basic Info */}
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Personal Information</p>
                  <div><label className="block text-[10px] text-slate-500 mb-1">First Name *</label><input type="text" value={formData.firstName || ''} onChange={e => setFormData({ ...formData, firstName: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Last Name *</label><input type="text" value={formData.lastName || ''} onChange={e => setFormData({ ...formData, lastName: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Email</label><input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Phone</label><PhoneInput value={formData.phone || ''} onChange={(value) => setFormData({ ...formData, phone: value })} placeholder="Phone number" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[10px] text-slate-500 mb-1">Date of Birth</label><input type="date" value={formData.dateOfBirth || ''} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Gender</label><select value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
                  </div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Status</label><select value={formData.status || 'active'} onChange={e => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                </div>
                {/* Column 2: Address */}
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Address</p>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Street Address</label><input type="text" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">City</label><input type="text" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[10px] text-slate-500 mb-1">State</label><input type="text" value={formData.state || ''} onChange={e => setFormData({ ...formData, state: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Postal Code</label><input type="text" value={formData.postalCode || ''} onChange={e => setFormData({ ...formData, postalCode: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1 pt-2">Insurance</p>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Provider</label><input type="text" value={formData.insuranceProvider || ''} onChange={e => setFormData({ ...formData, insuranceProvider: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Policy Number</label><input type="text" value={formData.insuranceNumber || ''} onChange={e => setFormData({ ...formData, insuranceNumber: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                </div>
                {/* Column 3: Emergency & Notes */}
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Emergency Contact</p>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Contact Name</label><input type="text" value={formData.emergencyContactName || ''} onChange={e => setFormData({ ...formData, emergencyContactName: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">Contact Phone</label><PhoneInput value={formData.emergencyContactPhone || ''} onChange={(value) => setFormData({ ...formData, emergencyContactPhone: value })} placeholder="Emergency phone" /></div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1 pt-2">Notes</p>
                  <div><textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={4} placeholder="Additional notes..." className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 resize-none" /></div>
                </div>
              </div>
            </form>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Cancel</button>
              <button onClick={handleSubmit} disabled={saving || !formData.firstName || !formData.lastName} className="px-5 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{saving ? 'Saving...' : editingPatient ? 'Update Patient' : 'Add Patient'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[200px]"><div className="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <PatientsPageContent />
    </Suspense>
  );
}

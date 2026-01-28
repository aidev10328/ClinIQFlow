'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';

const ITEMS_PER_PAGE = 15;

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
  appointmentCount?: number;
  reportCount?: number;
}

interface Appointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  doctorName?: string;
  reasonForVisit?: string;
}

interface Report {
  id: string;
  title: string;
  createdAt: string;
  type: string;
  status: string;
}

interface Entitlements {
  hasAppointments: boolean;
  hasBrief: boolean;
}

function PatientsPageContent() {
  const searchParams = useSearchParams();
  const { currentHospital } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Product entitlements
  const [entitlements, setEntitlements] = useState<Entitlements>({ hasAppointments: false, hasBrief: false });

  // Selected patient and detail view
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [detailTab, setDetailTab] = useState<'appointments' | 'reports'>('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Patient>>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    insuranceProvider: '',
    insuranceNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: '',
    status: 'active',
  });

  useEffect(() => {
    Promise.all([fetchEntitlements(), fetchPatients()]);
    if (searchParams.get('action') === 'add') {
      setShowModal(true);
    }
  }, [searchParams]);

  async function fetchEntitlements() {
    try {
      const res = await apiFetch('/v1/products/entitlements');
      if (res.ok) {
        const data = await res.json();
        setEntitlements({
          hasAppointments: data.some((e: any) => e.productCode === 'APPOINTMENTS' && e.isActive),
          hasBrief: data.some((e: any) => e.productCode === 'BRIEF' && e.isActive),
        });
      }
    } catch (error) {
      console.error('Failed to fetch entitlements:', error);
    }
  }

  async function fetchPatients() {
    try {
      const res = await apiFetch('/v1/patients');
      if (res.ok) {
        const data = await res.json();
        // Add mock counts for now - these would come from the API
        const patientsWithCounts = data.map((p: Patient) => ({
          ...p,
          appointmentCount: Math.floor(Math.random() * 10),
          reportCount: Math.floor(Math.random() * 5),
        }));
        setPatients(patientsWithCounts);
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
    }
  }

  const fetchPatientDetails = useCallback(async (patient: Patient) => {
    setLoadingDetails(true);
    setAppointments([]);
    setReports([]);

    try {
      // Fetch appointments if licensed
      if (entitlements.hasAppointments) {
        const apptRes = await apiFetch(`/v1/appointments?patientId=${patient.id}`);
        if (apptRes.ok) {
          const apptData = await apptRes.json();
          setAppointments(apptData);
        }
      }

      // Fetch reports if licensed (placeholder - would be actual API call)
      if (entitlements.hasBrief) {
        // const reportRes = await apiFetch(`/v1/reports?patientId=${patient.id}`);
        // if (reportRes.ok) {
        //   const reportData = await reportRes.json();
        //   setReports(reportData);
        // }
        setReports([]); // Placeholder
      }
    } catch (error) {
      console.error('Failed to fetch patient details:', error);
    } finally {
      setLoadingDetails(false);
    }
  }, [entitlements]);

  useEffect(() => {
    if (selectedPatient) {
      fetchPatientDetails(selectedPatient);
    }
  }, [selectedPatient, fetchPatientDetails]);

  function resetForm() {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      gender: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      insuranceProvider: '',
      insuranceNumber: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      notes: '',
      status: 'active',
    });
    setEditingPatient(null);
  }

  function handleEdit(patient: Patient) {
    setEditingPatient(patient);
    setFormData({
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email || '',
      phone: patient.phone || '',
      dateOfBirth: patient.dateOfBirth || '',
      gender: patient.gender || '',
      address: patient.address || '',
      city: patient.city || '',
      state: patient.state || '',
      postalCode: patient.postalCode || '',
      insuranceProvider: patient.insuranceProvider || '',
      insuranceNumber: patient.insuranceNumber || '',
      emergencyContactName: patient.emergencyContactName || '',
      emergencyContactPhone: patient.emergencyContactPhone || '',
      notes: patient.notes || '',
      status: patient.status,
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingPatient
        ? `/v1/patients/${editingPatient.id}`
        : '/v1/patients';
      const method = editingPatient ? 'PATCH' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchPatients();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to save patient');
      }
    } catch (error) {
      console.error('Failed to save patient:', error);
      alert('Failed to save patient');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(patient: Patient) {
    try {
      const res = await apiFetch(`/v1/patients/${patient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: patient.status === 'active' ? 'inactive' : 'active',
        }),
      });

      if (res.ok) {
        fetchPatients();
      }
    } catch (error) {
      console.error('Failed to update patient:', error);
    }
  }

  function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient);
    // Default to appointments tab if available, otherwise reports
    if (entitlements.hasAppointments) {
      setDetailTab('appointments');
    } else if (entitlements.hasBrief) {
      setDetailTab('reports');
    }
  }

  // Filter patients
  const filteredPatients = patients.filter(patient => {
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      patient.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone?.includes(searchQuery);

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && patient.status === statusFilter;
  });

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredPatients.length / ITEMS_PER_PAGE);
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Check if any feature columns should show
  const showFeatureColumns = entitlements.hasAppointments || entitlements.hasBrief;

  if (loading) {
    return null;
  }

  return (
    <div className="page-fullheight flex flex-col p-4 sm:p-5 lg:p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="admin-page-title">Patients</h1>
          <p className="admin-page-subtitle">
            Manage patient records at {currentHospital?.name}
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Patient
        </button>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Panel - Patient List */}
        <div className={`flex flex-col ${selectedPatient && showFeatureColumns ? 'w-3/5' : 'w-full'} transition-all duration-300`}>
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="search-input-wrapper flex-1">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input w-full sm:w-32"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Patients Grid */}
          <div className="flex-1 admin-data-table-wrapper overflow-auto">
            <div className="admin-table-container">
              <table className="admin-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="admin-table-th">Patient</th>
                    <th className="admin-table-th hidden md:table-cell">Contact</th>
                    {entitlements.hasAppointments && (
                      <th className="admin-table-th text-center">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="hidden lg:inline">Appts</span>
                        </div>
                      </th>
                    )}
                    {entitlements.hasBrief && (
                      <th className="admin-table-th text-center">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="hidden lg:inline">Reports</span>
                        </div>
                      </th>
                    )}
                    <th className="admin-table-th">Status</th>
                    <th className="admin-table-th sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPatients.length > 0 ? (
                    paginatedPatients.map((patient) => (
                      <tr
                        key={patient.id}
                        onClick={() => handleSelectPatient(patient)}
                        className={`cursor-pointer transition-colors ${
                          selectedPatient?.id === patient.id
                            ? 'bg-blue-50 border-l-2 border-l-[var(--color-primary)]'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="admin-table-td">
                          <div className="flex items-center gap-2">
                            <div className="avatar avatar-sm">
                              {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {patient.firstName} {patient.lastName}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">{patient.gender || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="admin-table-td hidden md:table-cell">
                          <p className="text-sm text-gray-900">{patient.phone || '-'}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[150px]">{patient.email || '-'}</p>
                        </td>
                        {entitlements.hasAppointments && (
                          <td className="admin-table-td text-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                              patient.appointmentCount ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {patient.appointmentCount || 0}
                            </span>
                          </td>
                        )}
                        {entitlements.hasBrief && (
                          <td className="admin-table-td text-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                              patient.reportCount ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {patient.reportCount || 0}
                            </span>
                          </td>
                        )}
                        <td className="admin-table-td">
                          <span className={`status-pill text-xs ${patient.status === 'active' ? 'status-pill-active' : 'status-pill-inactive'}`}>
                            {patient.status}
                          </span>
                        </td>
                        <td className="admin-table-td">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(patient);
                            }}
                            className="p-1.5 rounded hover:bg-gray-200 text-gray-500"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={showFeatureColumns ? 6 : 4} className="admin-table-td">
                        <div className="admin-empty-state py-8">
                          <div className="admin-empty-icon">
                            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <p className="admin-empty-title text-sm">No patients found</p>
                          <p className="admin-empty-description text-xs">
                            {searchQuery || statusFilter !== 'all'
                              ? 'Try adjusting your search'
                              : 'Add your first patient'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white">
                <div className="text-xs text-gray-500">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredPatients.length)} of {filteredPatients.length}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm px-2">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Details */}
        {selectedPatient && showFeatureColumns && (
          <div className="w-2/5 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Patient Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="avatar avatar-lg">
                    {selectedPatient.firstName.charAt(0)}{selectedPatient.lastName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {selectedPatient.phone || selectedPatient.email || 'No contact info'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-500"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {entitlements.hasAppointments && (
                <button
                  onClick={() => setDetailTab('appointments')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    detailTab === 'appointments'
                      ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] bg-blue-50/50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Appointments
                  </div>
                </button>
              )}
              {entitlements.hasBrief && (
                <button
                  onClick={() => setDetailTab('reports')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    detailTab === 'reports'
                      ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] bg-blue-50/50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Reports
                  </div>
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingDetails ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailTab === 'appointments' && entitlements.hasAppointments ? (
                <div className="space-y-3">
                  {appointments.length > 0 ? (
                    appointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="p-3 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(appt.appointmentDate).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                            <p className="text-xs text-gray-500">
                              {appt.startTime} - {appt.endTime}
                            </p>
                            {appt.doctorName && (
                              <p className="text-xs text-gray-600 mt-1">Dr. {appt.doctorName}</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            appt.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            appt.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                            appt.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {appt.status}
                          </span>
                        </div>
                        {appt.reasonForVisit && (
                          <p className="text-xs text-gray-500 mt-2 truncate">{appt.reasonForVisit}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                      <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm">No appointments yet</p>
                    </div>
                  )}
                </div>
              ) : detailTab === 'reports' && entitlements.hasBrief ? (
                <div className="space-y-3">
                  {reports.length > 0 ? (
                    reports.map((report) => (
                      <div
                        key={report.id}
                        className="p-3 rounded-lg border border-gray-200 hover:border-purple-200 hover:bg-purple-50/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{report.title}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(report.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                            {report.type}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                      <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">No reports yet</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <p className="text-sm">Select a tab to view details</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(selectedPatient)}
                  className="flex-1 btn-secondary text-sm py-2"
                >
                  Edit Patient
                </button>
                {entitlements.hasAppointments && (
                  <button
                    onClick={() => {
                      // Navigate to appointments page with patient pre-selected
                      window.location.href = `/hospital/appointments?patientId=${selectedPatient.id}`;
                    }}
                    className="flex-1 btn-primary text-sm py-2"
                  >
                    Book Appointment
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Patient Modal */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">
                  {editingPatient ? 'Edit Patient' : 'Add New Patient'}
                </h2>
                <p className="admin-modal-subtitle">
                  {editingPatient ? 'Update patient information' : 'Register a new patient'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="admin-modal-body space-y-6">
                {/* Basic Information */}
                <div>
                  <h4 className="section-title mb-3">Basic Information</h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label form-label-required">First Name</label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="form-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label form-label-required">Last Name</label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="form-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <PhoneInput
                        value={formData.phone || ''}
                        onChange={(value) => setFormData({ ...formData, phone: value })}
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date of Birth</label>
                      <input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gender</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="form-input"
                      >
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h4 className="section-title mb-3">Address</h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="form-group sm:col-span-2">
                      <label className="form-label">Street Address</label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">State/Province</label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Postal Code</label>
                      <input
                        type="text"
                        value={formData.postalCode}
                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Insurance */}
                <div>
                  <h4 className="section-title mb-3">Insurance Information</h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label">Insurance Provider</label>
                      <input
                        type="text"
                        value={formData.insuranceProvider}
                        onChange={(e) => setFormData({ ...formData, insuranceProvider: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Policy Number</label>
                      <input
                        type="text"
                        value={formData.insuranceNumber}
                        onChange={(e) => setFormData({ ...formData, insuranceNumber: e.target.value })}
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div>
                  <h4 className="section-title mb-3">Emergency Contact</h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label">Contact Name</label>
                      <input
                        type="text"
                        value={formData.emergencyContactName}
                        onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Contact Phone</label>
                      <PhoneInput
                        value={formData.emergencyContactPhone || ''}
                        onChange={(value) => setFormData({ ...formData, emergencyContactPhone: value })}
                        placeholder="Phone number"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="form-input"
                    rows={3}
                    placeholder="Additional notes about the patient..."
                  />
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.firstName || !formData.lastName}
                  className="btn-primary"
                >
                  {saving ? 'Saving...' : editingPatient ? 'Update Patient' : 'Add Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PatientsPageContent />
    </Suspense>
  );
}

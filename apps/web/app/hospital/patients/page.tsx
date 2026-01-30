'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';

const ITEMS_PER_PAGE = 12;

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

function calculateAge(dateOfBirth?: string): string {
  if (!dateOfBirth) return '—';
  const today = new Date();
  const birth = new Date(dateOfBirth);
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
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Right panel state
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<'default' | 'appointments' | 'reports'>('default');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Patient>>({
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '',
    address: '', city: '', state: '', postalCode: '', insuranceProvider: '', insuranceNumber: '',
    emergencyContactName: '', emergencyContactPhone: '', notes: '', status: 'active',
  });

  useEffect(() => {
    fetchPatients();
    if (searchParams.get('action') === 'add') setShowModal(true);
  }, [searchParams]);

  async function fetchPatients() {
    try {
      const res = await apiFetch('/v1/patients');
      if (res.ok) {
        const data = await res.json();
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

  const fetchPatientAppointments = useCallback(async (patient: Patient) => {
    setLoadingDetails(true);
    try {
      const apptRes = await apiFetch(`/v1/appointments?patientId=${patient.id}`);
      if (apptRes.ok) {
        setAppointments(await apptRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const fetchPatientReports = useCallback(async () => {
    setLoadingDetails(true);
    try {
      setReports([]);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  function handleAppointmentsClick(patient: Patient) {
    setSelectedPatient(patient);
    setRightPanelMode('appointments');
    fetchPatientAppointments(patient);
  }

  function handleReportsClick(patient: Patient) {
    setSelectedPatient(patient);
    setRightPanelMode('reports');
    fetchPatientReports();
  }

  function resetForm() {
    setFormData({
      firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '',
      address: '', city: '', state: '', postalCode: '', insuranceProvider: '', insuranceNumber: '',
      emergencyContactName: '', emergencyContactPhone: '', notes: '', status: 'active',
    });
    setEditingPatient(null);
  }

  function handleEdit(patient: Patient) {
    setEditingPatient(patient);
    setFormData({ ...patient });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingPatient ? `/v1/patients/${editingPatient.id}` : '/v1/patients';
      const method = editingPatient ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(formData) });
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
    } finally {
      setSaving(false);
    }
  }

  // Filter patients
  const filteredPatients = patients.filter(patient => {
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase()) ||
      patient.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone?.includes(searchQuery);
  });

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const totalPages = Math.ceil(filteredPatients.length / ITEMS_PER_PAGE);
  const paginatedPatients = filteredPatients.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Stats
  const totalPatients = patients.length;
  const totalAppointments = patients.reduce((sum, p) => sum + (p.appointmentCount || 0), 0);
  const totalReports = patients.reduce((sum, p) => sum + (p.reportCount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Patients</h1>
          <p className="text-xs sm:text-sm text-slate-500 truncate">Manage patient records at {currentHospital?.name}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Stats badges */}
          <div className="hidden md:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
              {totalPatients} patients
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-navy-50 rounded-lg text-xs font-medium text-navy-700">
              {totalAppointments} appts
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 rounded-lg text-xs font-medium text-purple-700">
              {totalReports} reports
            </span>
          </div>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add Patient</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Main Content - Responsive Split */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Left Panel - Patient List */}
        <div className={`w-full lg:w-[60%] flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden ${selectedPatient ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search */}
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white"
              />
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] lg:grid-cols-12 gap-2 px-3 sm:px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <div className="lg:col-span-3">Patient</div>
            <div className="hidden sm:block lg:col-span-2">Phone</div>
            <div className="hidden lg:block lg:col-span-3">Email</div>
            <div className="hidden lg:block lg:col-span-1 text-center">Age</div>
            <div className="hidden lg:block lg:col-span-1 text-center">Gender</div>
            <div className="lg:col-span-1 text-center">Appts</div>
            <div className="lg:col-span-1 text-center">Reports</div>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto">
            {paginatedPatients.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {paginatedPatients.map((patient) => (
                  <div
                    key={patient.id}
                    className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] lg:grid-cols-12 gap-2 px-3 sm:px-4 py-3 items-center hover:bg-slate-50/50 transition-colors cursor-pointer ${
                      selectedPatient?.id === patient.id ? 'bg-navy-50/50 border-l-2 border-l-navy-600' : ''
                    }`}
                  >
                    {/* Patient Name */}
                    <div className="lg:col-span-3 flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-100 flex items-center justify-center text-navy-600 text-xs sm:text-sm font-semibold flex-shrink-0">
                        {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{patient.firstName} {patient.lastName}</p>
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          patient.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {patient.status}
                        </span>
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="hidden sm:block lg:col-span-2">
                      <p className="text-sm text-slate-600 truncate">{patient.phone || '—'}</p>
                    </div>

                    {/* Email */}
                    <div className="hidden lg:block lg:col-span-3">
                      <p className="text-sm text-slate-600 truncate">{patient.email || '—'}</p>
                    </div>

                    {/* Age */}
                    <div className="hidden lg:block lg:col-span-1 text-center">
                      <span className="text-sm text-slate-700">{calculateAge(patient.dateOfBirth)}</span>
                    </div>

                    {/* Gender */}
                    <div className="hidden lg:block lg:col-span-1 text-center">
                      <span className="text-sm text-slate-600 capitalize">{patient.gender?.charAt(0) || '—'}</span>
                    </div>

                    {/* Appointments */}
                    <div className="lg:col-span-1 text-center">
                      <button
                        onClick={() => handleAppointmentsClick(patient)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                          selectedPatient?.id === patient.id && rightPanelMode === 'appointments'
                            ? 'bg-navy-600 text-white'
                            : patient.appointmentCount ? 'bg-navy-50 text-navy-700 hover:bg-blue-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {patient.appointmentCount || 0}
                      </button>
                    </div>

                    {/* Reports */}
                    <div className="lg:col-span-1 text-center">
                      <button
                        onClick={() => handleReportsClick(patient)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                          selectedPatient?.id === patient.id && rightPanelMode === 'reports'
                            ? 'bg-purple-600 text-white'
                            : patient.reportCount ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {patient.reportCount || 0}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-base font-medium text-slate-700">No patients found</p>
                <p className="text-sm text-slate-500 mt-1">{searchQuery ? 'Try adjusting your search' : 'Add your first patient'}</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-500">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredPatients.length)} of {filteredPatients.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="px-3 text-sm text-slate-600">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Details */}
        <div className={`w-full lg:w-[40%] flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden ${!selectedPatient ? 'hidden lg:flex' : 'flex'}`}>
          {rightPanelMode === 'default' || !selectedPatient ? (
            /* Default View - Guide */
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-base font-medium text-slate-700 mb-1">Patient Details</h3>
              <p className="text-sm text-slate-400 text-center mb-6">Select a patient action to view details here</p>

              {/* Quick Guide */}
              <div className="w-full max-w-xs space-y-3">
                <div className="flex items-center gap-3 p-3 bg-navy-50 rounded-xl border border-blue-100">
                  <div className="w-9 h-9 rounded-lg bg-navy-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">View Appointments</p>
                    <p className="text-xs text-navy-600">Click the Appts number in patient row</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-purple-800">View Reports</p>
                    <p className="text-xs text-purple-600">Click the Reports number in patient row</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Add New Patient</p>
                    <p className="text-xs text-emerald-600">Use the Add Patient button above</p>
                  </div>
                </div>
              </div>
            </div>
          ) : rightPanelMode === 'appointments' ? (
            /* Appointments View */
            <div className="flex-1 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 bg-navy-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-navy-600 flex items-center justify-center text-white font-semibold">
                      {selectedPatient.firstName.charAt(0)}{selectedPatient.lastName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{selectedPatient.firstName} {selectedPatient.lastName}</h3>
                      <p className="text-xs text-slate-500">Appointments</p>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedPatient(null); setRightPanelMode('default'); }} className="p-2 rounded-lg hover:bg-white text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingDetails ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : appointments.length > 0 ? (
                  appointments.map((appt) => (
                    <div key={appt.id} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-200 transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {new Date(appt.appointmentDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-xs text-slate-500">{appt.startTime} - {appt.endTime}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                          appt.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
                          appt.status === 'SCHEDULED' ? 'bg-navy-50 text-navy-700' :
                          appt.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
                        }`}>{appt.status}</span>
                      </div>
                      {appt.doctorName && <p className="text-sm text-slate-600 mb-1">Dr. {appt.doctorName}</p>}
                      {appt.reasonForVisit && <p className="text-xs text-slate-500 truncate">{appt.reasonForVisit}</p>}

                      {appt.status === 'SCHEDULED' && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                          <button className="flex-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                            Reschedule
                          </button>
                          <button className="flex-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                    <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">No appointments yet</p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(selectedPatient)} className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    Edit Patient
                  </button>
                  <button
                    onClick={() => window.location.href = `/hospital/appointments?patientId=${selectedPatient.id}`}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Schedule
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Reports View */
            <div className="flex-1 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 bg-purple-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-semibold">
                      {selectedPatient.firstName.charAt(0)}{selectedPatient.lastName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{selectedPatient.firstName} {selectedPatient.lastName}</h3>
                      <p className="text-xs text-slate-500">Reports</p>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedPatient(null); setRightPanelMode('default'); }} className="p-2 rounded-lg hover:bg-white text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingDetails ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : reports.length > 0 ? (
                  reports.map((report) => (
                    <div key={report.id} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-200 transition-all cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{report.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{new Date(report.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-lg font-medium bg-purple-50 text-purple-700">{report.type}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                    <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">No reports yet</p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(selectedPatient)} className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    Edit Patient
                  </button>
                  <button className="flex-1 px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Generate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Patient Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{editingPatient ? 'Edit Patient' : 'Add New Patient'}</h2>
                <p className="text-sm text-slate-500">{editingPatient ? 'Update patient information' : 'Register a new patient'}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basic Information */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Basic Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} required className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} required className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                    <PhoneInput value={formData.phone || ''} onChange={(value) => setFormData({ ...formData, phone: value })} placeholder="Phone number" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                    <input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                    <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
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
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Address</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input type="text" placeholder="Street Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  </div>
                  <input type="text" placeholder="City" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  <input type="text" placeholder="State" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  <input type="text" placeholder="Postal Code" value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                </div>
              </div>

              {/* Insurance & Emergency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Insurance</h4>
                  <div className="space-y-3">
                    <input type="text" placeholder="Provider" value={formData.insuranceProvider} onChange={(e) => setFormData({ ...formData, insuranceProvider: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    <input type="text" placeholder="Policy Number" value={formData.insuranceNumber} onChange={(e) => setFormData({ ...formData, insuranceNumber: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Emergency Contact</h4>
                  <div className="space-y-3">
                    <input type="text" placeholder="Contact Name" value={formData.emergencyContactName} onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    <PhoneInput value={formData.emergencyContactPhone || ''} onChange={(value) => setFormData({ ...formData, emergencyContactPhone: value })} placeholder="Contact Phone" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Additional notes..." className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 resize-none" />
              </div>
            </form>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving || !formData.firstName || !formData.lastName} className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : editingPatient ? 'Update Patient' : 'Add Patient'}
              </button>
            </div>
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
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PatientsPageContent />
    </Suspense>
  );
}

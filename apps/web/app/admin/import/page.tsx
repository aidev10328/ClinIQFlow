'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../components/AuthProvider';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

type EntityType = 'patients' | 'doctors';
type Step = 'setup' | 'upload' | 'mapping' | 'preview' | 'importing' | 'results';

interface ImportColumn {
  column: string;
  label: string;
  required: boolean;
  type: string;
  options?: string[];
}

interface UploadResult {
  fileId: string;
  headers: string[];
  sampleData: Record<string, any>[];
  totalRows: number;
}

interface RowResult {
  row: number;
  status: 'success' | 'error';
  error?: string;
  data?: Record<string, any>;
}

interface ImportResult {
  totalRows: number;
  successful: number;
  failed: number;
  results: RowResult[];
  mappingSaved?: boolean;
}

interface SavedMapping {
  id: string;
  name: string;
  entity_type: string;
  mapping_json: Record<string, string>;
}

// Fuzzy auto-match Excel headers to DB columns
const ALIASES: Record<string, string[]> = {
  first_name: ['firstname', 'first', 'fname', 'given_name', 'givenname'],
  last_name: ['lastname', 'last', 'lname', 'surname', 'family_name', 'familyname'],
  full_name: ['fullname', 'name', 'doctor_name', 'doctorname'],
  date_of_birth: ['dob', 'birth_date', 'birthday', 'birthdate'],
  phone: ['mobile', 'cell', 'telephone', 'contact_number', 'phone_number', 'phonenumber', 'mobile_number'],
  email: ['email_address', 'e_mail', 'emailaddress'],
  gender: ['sex'],
  postal_code: ['zip', 'zipcode', 'zip_code', 'pincode', 'pin_code', 'postcode'],
  address: ['street', 'street_address', 'address_line'],
  address_line1: ['street', 'street_address', 'address', 'address_line'],
  insurance_provider: ['insurer', 'insurance_company', 'insurance'],
  insurance_number: ['policy_number', 'insurance_id', 'policy_id'],
  emergency_contact_name: ['emergency_name', 'emergency_contact', 'kin_name', 'next_of_kin'],
  emergency_contact_phone: ['emergency_phone', 'emergency_number', 'kin_phone'],
  specialization: ['specialty', 'speciality', 'spec'],
  qualification: ['degree', 'degrees', 'qualifications'],
  license_number: ['license', 'licence', 'licence_number', 'registration', 'registration_number'],
  years_of_experience: ['experience', 'years_experience', 'exp', 'yoe'],
  consultation_fee: ['fee', 'fees', 'charge', 'consultation_charge'],
  employment_type: ['employment', 'type', 'emp_type'],
};

function autoMapColumns(
  headers: string[],
  dbColumns: ImportColumn[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedDbCols = new Set<string>();

  for (const header of headers) {
    const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    // Direct column name match
    const direct = dbColumns.find(c => c.column === norm && !usedDbCols.has(c.column));
    if (direct) { mapping[header] = direct.column; usedDbCols.add(direct.column); continue; }

    // Label match
    const labelMatch = dbColumns.find(c =>
      !usedDbCols.has(c.column) &&
      c.label.toLowerCase().replace(/[^a-z0-9]/g, '') === header.toLowerCase().replace(/[^a-z0-9]/g, ''),
    );
    if (labelMatch) { mapping[header] = labelMatch.column; usedDbCols.add(labelMatch.column); continue; }

    // Alias match
    for (const [dbCol, aliasList] of Object.entries(ALIASES)) {
      if (usedDbCols.has(dbCol)) continue;
      if (aliasList.includes(norm) || norm.includes(dbCol.replace(/_/g, ''))) {
        const col = dbColumns.find(c => c.column === dbCol);
        if (col) { mapping[header] = dbCol; usedDbCols.add(dbCol); break; }
      }
    }
  }

  return mapping;
}

export default function ImportPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  // State
  const [step, setStep] = useState<Step>('setup');
  const [entityType, setEntityType] = useState<EntityType>('patients');
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dbColumns, setDbColumns] = useState<ImportColumn[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
  const [saveMappingName, setSaveMappingName] = useState('');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch hospitals
  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/v1/admin/hospitals`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(setHospitals)
      .catch(() => {});
  }, [accessToken]);

  // Fetch DB columns when entity type changes (in mapping step)
  const fetchColumns = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/v1/admin/import/columns?entityType=${entityType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setDbColumns(await res.json());
    } catch {}
  }, [accessToken, entityType]);

  // Fetch saved mappings
  const fetchMappings = useCallback(async () => {
    if (!accessToken || !selectedHospital) return;
    try {
      const res = await fetch(`${API_BASE}/v1/admin/import/mappings?hospitalId=${selectedHospital}&entityType=${entityType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setSavedMappings(await res.json());
    } catch {}
  }, [accessToken, selectedHospital, entityType]);

  // Upload file
  const handleUpload = async () => {
    if (!accessToken || !file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/v1/admin/import/upload`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Upload failed');
      }
      const result: UploadResult = await res.json();
      setUploadResult(result);

      // Fetch columns and mappings, then auto-map
      await fetchColumns();
      await fetchMappings();
      setStep('mapping');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Auto-map when columns and upload result are both available
  useEffect(() => {
    if (uploadResult && dbColumns.length > 0 && Object.keys(mapping).length === 0) {
      setMapping(autoMapColumns(uploadResult.headers, dbColumns));
    }
  }, [uploadResult, dbColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load a saved mapping
  const loadMapping = (saved: SavedMapping) => {
    setMapping(saved.mapping_json);
  };

  // Execute import
  const handleImport = async () => {
    if (!accessToken || !uploadResult) return;
    setStep('importing');
    setError(null);

    try {
      const endpoint = entityType === 'patients' ? 'import/patients' : 'import/doctors';
      const body: any = {
        fileId: uploadResult.fileId,
        hospitalId: selectedHospital,
        mapping,
      };
      if (saveMappingName.trim()) body.saveMappingAs = saveMappingName.trim();
      if (entityType === 'doctors' && defaultPassword) body.defaultPassword = defaultPassword;

      const res = await fetch(`${API_BASE}/v1/admin/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Import failed');
      }

      setImportResult(await res.json());
      setStep('results');
    } catch (err: any) {
      setError(err.message);
      setStep('preview');
    }
  };

  // Reset to start
  const reset = () => {
    setStep('setup');
    setFile(null);
    setUploadResult(null);
    setMapping({});
    setImportResult(null);
    setError(null);
    setSaveMappingName('');
    setDefaultPassword('');
  };

  // File drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.match(/\.(xlsx|xls|csv)$/i)) {
      setFile(dropped);
    } else {
      setError('Please upload an .xlsx, .xls, or .csv file');
    }
  };

  // Check if all required columns are mapped
  const requiredMapped = dbColumns
    .filter(c => c.required)
    .every(c => Object.values(mapping).includes(c.column));

  // Hospital name
  const hospitalName = hospitals.find(h => h.id === selectedHospital)?.name || '';

  // Count mapped columns
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload Excel files to bulk-import patients or doctors into a hospital
        </p>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-2 text-xs">
        {(['setup', 'upload', 'mapping', 'preview', 'results'] as const).map((s, i) => {
          const labels = ['Setup', 'Upload', 'Mapping', 'Preview', 'Results'];
          const stepOrder = ['setup', 'upload', 'mapping', 'preview', 'results'];
          const currentIdx = stepOrder.indexOf(step === 'importing' ? 'preview' : step);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <React.Fragment key={s}>
              {i > 0 && <div className={`flex-1 h-0.5 ${isDone ? 'bg-blue-500' : 'bg-gray-200'}`} />}
              <div className={`flex items-center gap-1.5 ${isActive ? 'text-blue-600 font-semibold' : isDone ? 'text-blue-500' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-blue-500 text-white' : isDone ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {isDone ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  ) : i + 1}
                </div>
                <span className="hidden sm:inline">{labels[i]}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* ─── Step 1: Setup ─── */}
      {step === 'setup' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">What are you importing?</label>
            <div className="flex gap-3">
              {(['patients', 'doctors'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setEntityType(t)}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    entityType === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {t === 'patients' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {t === 'patients' ? 'Patients' : 'Doctors'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Hospital</label>
            <select
              value={selectedHospital}
              onChange={e => setSelectedHospital(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">-- Select a hospital --</option>
              {hospitals.map(h => (
                <option key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setStep('upload')}
            disabled={!selectedHospital}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* ─── Step 2: Upload ─── */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="text-sm text-gray-600">
            Importing <strong>{entityType}</strong> into <strong>{hospitalName}</strong>
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
            />
            {file ? (
              <div>
                <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="text-xs text-red-500 mt-2 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-600">Drag & drop your Excel file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv (max 10MB)</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('setup')}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Back
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload & Parse'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Mapping ─── */}
      {step === 'mapping' && uploadResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Map Columns</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {uploadResult.totalRows} rows found &middot; {mappedCount} of {uploadResult.headers.length} columns mapped
              </p>
            </div>
            {savedMappings.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Load saved:</label>
                <select
                  onChange={e => {
                    const m = savedMappings.find(s => s.id === e.target.value);
                    if (m) loadMapping(m);
                  }}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                  defaultValue=""
                >
                  <option value="">Select...</option>
                  {savedMappings.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Required fields warning */}
          {!requiredMapped && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-xs">
              Map all required fields (marked with *) before proceeding.
            </div>
          )}

          {/* Mapping rows */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {uploadResult.headers.map(header => {
              const sampleVal = uploadResult.sampleData[0]?.[header] || '';
              return (
                <div key={header} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{header}</p>
                    <p className="text-[10px] text-gray-400 truncate">e.g. {String(sampleVal).substring(0, 40) || '(empty)'}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <select
                    value={mapping[header] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [header]: e.target.value }))}
                    className={`w-48 text-sm border rounded-lg px-2 py-1.5 ${
                      mapping[header] ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                    }`}
                  >
                    <option value="">-- Skip --</option>
                    {dbColumns.map(col => (
                      <option key={col.column} value={col.column}>
                        {col.label}{col.required ? ' *' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Save mapping name */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <label className="text-xs text-gray-500 flex-shrink-0">Save mapping as:</label>
            <input
              type="text"
              value={saveMappingName}
              onChange={e => setSaveMappingName(e.target.value)}
              placeholder="e.g., Hospital A Patient Format"
              className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Back
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={!requiredMapped}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Preview
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Preview ─── */}
      {step === 'preview' && uploadResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Preview Import</h2>

          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
            <strong>{uploadResult.totalRows}</strong> {entityType} will be imported into <strong>{hospitalName}</strong>
          </div>

          {entityType === 'doctors' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Default password for new doctor accounts (leave blank for auto-generated)
              </label>
              <input
                type="text"
                value={defaultPassword}
                onChange={e => setDefaultPassword(e.target.value)}
                placeholder="Auto-generated if empty"
                className="w-full max-w-xs text-sm border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">#</th>
                  {Object.entries(mapping).filter(([, v]) => v).map(([excelCol, dbCol]) => (
                    <th key={excelCol} className="px-3 py-2 text-left font-medium text-gray-500">
                      {dbColumns.find(c => c.column === dbCol)?.label || dbCol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {uploadResult.sampleData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    {Object.entries(mapping).filter(([, v]) => v).map(([excelCol]) => (
                      <td key={excelCol} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">
                        {String(row[excelCol] || '').substring(0, 50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {uploadResult.totalRows > 10 && (
            <p className="text-[10px] text-gray-400">Showing first {Math.min(10, uploadResult.sampleData.length)} of {uploadResult.totalRows} rows</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import {uploadResult.totalRows} {entityType}
            </button>
          </div>
        </div>
      )}

      {/* ─── Importing ─── */}
      {step === 'importing' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-gray-700">Importing {entityType}...</p>
          <p className="text-xs text-gray-400 mt-1">This may take a moment for large files</p>
        </div>
      )}

      {/* ─── Step 5: Results ─── */}
      {step === 'results' && importResult && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
              <p className="text-xs text-gray-500">Total Rows</p>
              <p className="text-2xl font-bold text-gray-900">{importResult.totalRows}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-green-200 text-center">
              <p className="text-xs text-green-600">Successful</p>
              <p className="text-2xl font-bold text-green-600">{importResult.successful}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-red-200 text-center">
              <p className="text-xs text-red-600">Failed</p>
              <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
            </div>
          </div>

          {importResult.mappingSaved && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs">
              Column mapping saved for future imports.
            </div>
          )}

          {/* Errors */}
          {importResult.failed > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-red-700 mb-2">Failed Rows</h3>
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {importResult.results
                  .filter(r => r.status === 'error')
                  .map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-red-50 rounded">
                      <span className="text-red-400 font-mono">Row {r.row}</span>
                      <span className="text-red-700">{r.error}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Success details */}
          {importResult.successful > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-green-700 mb-2">
                Successfully Imported ({importResult.successful})
              </h3>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {importResult.results
                  .filter(r => r.status === 'success')
                  .slice(0, 50)
                  .map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 text-green-700">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Row {r.row}: {r.data?.first_name || r.data?.fullName || r.data?.email || 'OK'} {r.data?.last_name || ''}</span>
                    </div>
                  ))}
                {importResult.successful > 50 && (
                  <p className="text-[10px] text-gray-400 pl-5">...and {importResult.successful - 50} more</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Import More
          </button>
        </div>
      )}
    </div>
  );
}

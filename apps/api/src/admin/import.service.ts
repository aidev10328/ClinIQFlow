import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as XLSX from 'xlsx';
import { storeFile, getFile, deleteFile } from './file-cache';
import { PATIENT_COLUMNS, DOCTOR_COLUMNS, ImportColumn } from './import-columns';
import { randomBytes } from 'crypto';

export interface ParseResult {
  fileId: string;
  headers: string[];
  sampleData: Record<string, any>[];
  totalRows: number;
}

export interface RowResult {
  row: number;
  status: 'success' | 'error';
  error?: string;
  data?: Record<string, any>;
}

export interface ImportResult {
  totalRows: number;
  successful: number;
  failed: number;
  results: RowResult[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private getAdminClient() {
    const client = this.supabaseService.getAdminClient();
    if (!client) throw new ForbiddenException('Admin access not available');
    return client;
  }

  // ─── Parse Excel ────────────────────────────────────────────────

  parseExcelFile(buffer: Buffer): ParseResult {
    const workbook = XLSX.read(buffer, { cellDates: true, type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Excel file has no sheets');

    const sheet = workbook.Sheets[sheetName];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (jsonData.length < 2) {
      throw new BadRequestException('File must have a header row and at least one data row');
    }

    const headers = jsonData[0].map((h: any) => String(h).trim()).filter(Boolean);
    if (headers.length === 0) {
      throw new BadRequestException('No column headers found in the first row');
    }

    const rows: Record<string, any>[] = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      // Skip completely empty rows
      if (!row || row.every((cell: any) => cell === '' || cell === null || cell === undefined)) continue;

      const obj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        let val = row[idx];
        // Convert Date objects to ISO strings
        if (val instanceof Date) {
          val = val.toISOString().split('T')[0]; // YYYY-MM-DD
        }
        obj[h] = val !== undefined && val !== null ? String(val).trim() : '';
      });
      rows.push(obj);
    }

    if (rows.length === 0) {
      throw new BadRequestException('No data rows found in the file');
    }

    const fileId = storeFile(headers, rows);
    return {
      fileId,
      headers,
      sampleData: rows.slice(0, 5),
      totalRows: rows.length,
    };
  }

  // ─── Get Columns ───────────────────────────────────────────────

  getColumns(entityType: string): ImportColumn[] {
    if (entityType === 'patients') return PATIENT_COLUMNS;
    if (entityType === 'doctors') return DOCTOR_COLUMNS;
    throw new BadRequestException('Invalid entity type. Use "patients" or "doctors".');
  }

  // ─── Import Patients ──────────────────────────────────────────

  async importPatients(
    hospitalId: string,
    fileId: string,
    mapping: Record<string, string>,
  ): Promise<ImportResult> {
    const cached = getFile(fileId);
    if (!cached) throw new BadRequestException('File expired or not found. Please upload again.');

    const adminClient = this.getAdminClient();
    const results: RowResult[] = [];

    // Validate required fields are mapped
    const requiredCols = PATIENT_COLUMNS.filter(c => c.required).map(c => c.column);
    const mappedDbCols = Object.values(mapping);
    for (const req of requiredCols) {
      if (!mappedDbCols.includes(req)) {
        throw new BadRequestException(`Required column "${req}" is not mapped`);
      }
    }

    // Pre-fetch existing phones for duplicate detection
    const { data: existingPatients } = await adminClient
      .from('patients')
      .select('phone')
      .eq('hospital_id', hospitalId)
      .not('phone', 'is', null);
    const existingPhones = new Set((existingPatients || []).map((p: any) => p.phone));
    const seenPhones = new Set<string>();

    const BATCH_SIZE = 50;
    const rows = cached.rows;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const validRows: { rowIndex: number; data: Record<string, any> }[] = [];

      for (let j = 0; j < batch.length; j++) {
        const rowIndex = i + j + 1; // 1-based row number
        const mapped = this.applyMapping(batch[j], mapping);

        // Validate required fields
        if (!mapped.first_name) {
          results.push({ row: rowIndex, status: 'error', error: 'Missing required field: first_name' });
          continue;
        }
        if (!mapped.last_name) {
          results.push({ row: rowIndex, status: 'error', error: 'Missing required field: last_name' });
          continue;
        }

        // Phone duplicate check
        if (mapped.phone) {
          if (existingPhones.has(mapped.phone) || seenPhones.has(mapped.phone)) {
            results.push({ row: rowIndex, status: 'error', error: `Duplicate phone number: ${mapped.phone}` });
            continue;
          }
          seenPhones.add(mapped.phone);
        }

        // Build insert row
        const insertData: Record<string, any> = { hospital_id: hospitalId };
        for (const col of PATIENT_COLUMNS) {
          if (mapped[col.column] !== undefined && mapped[col.column] !== '') {
            insertData[col.column] = this.castValue(mapped[col.column], col);
          }
        }
        // Default status
        if (!insertData.status) insertData.status = 'active';

        validRows.push({ rowIndex, data: insertData });
      }

      if (validRows.length === 0) continue;

      // Try bulk insert first
      const { data: inserted, error } = await adminClient
        .from('patients')
        .insert(validRows.map(r => r.data))
        .select('id, first_name, last_name');

      if (error) {
        // Fallback to individual inserts
        this.logger.warn(`Bulk insert failed (batch ${i}): ${error.message}. Falling back to individual.`);
        for (const r of validRows) {
          const { data: single, error: singleError } = await adminClient
            .from('patients')
            .insert(r.data)
            .select('id, first_name, last_name')
            .single();

          if (singleError) {
            results.push({ row: r.rowIndex, status: 'error', error: singleError.message });
          } else {
            results.push({ row: r.rowIndex, status: 'success', data: single });
          }
        }
      } else {
        validRows.forEach((r, idx) => {
          results.push({ row: r.rowIndex, status: 'success', data: inserted?.[idx] || {} });
        });
      }
    }

    // Cleanup file from cache
    deleteFile(fileId);

    const successful = results.filter(r => r.status === 'success').length;
    return {
      totalRows: rows.length,
      successful,
      failed: rows.length - successful,
      results,
    };
  }

  // ─── Import Doctors ───────────────────────────────────────────

  async importDoctors(
    hospitalId: string,
    fileId: string,
    mapping: Record<string, string>,
    defaultPassword?: string,
  ): Promise<ImportResult> {
    const cached = getFile(fileId);
    if (!cached) throw new BadRequestException('File expired or not found. Please upload again.');

    // Validate required fields
    const requiredCols = DOCTOR_COLUMNS.filter(c => c.required).map(c => c.column);
    const mappedDbCols = Object.values(mapping);
    for (const req of requiredCols) {
      if (!mappedDbCols.includes(req)) {
        throw new BadRequestException(`Required column "${req}" is not mapped`);
      }
    }

    const rows = cached.rows;
    const results: RowResult[] = [];

    // Process in small concurrent batches
    const CONCURRENCY = 5;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((row, idx) =>
          this.importSingleDoctor(hospitalId, this.applyMapping(row, mapping), defaultPassword, i + idx + 1),
        ),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ row: i + 1, status: 'error', error: result.reason?.message || 'Unknown error' });
        }
      }
    }

    deleteFile(fileId);

    const successful = results.filter(r => r.status === 'success').length;
    return {
      totalRows: rows.length,
      successful,
      failed: rows.length - successful,
      results,
    };
  }

  private async importSingleDoctor(
    hospitalId: string,
    mapped: Record<string, any>,
    defaultPassword: string | undefined,
    rowIndex: number,
  ): Promise<RowResult> {
    const adminClient = this.getAdminClient();

    const email = mapped.email?.toLowerCase()?.trim();
    if (!email) return { row: rowIndex, status: 'error', error: 'Email is required for doctors' };

    const fullName = mapped.full_name?.trim() || email.split('@')[0];
    const password = defaultPassword || this.generatePassword();

    // Step 1: Create or find auth user
    let userId: string;
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: fullName },
    });

    if (authError) {
      if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
        // Find existing user
        const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1 });
        // Search by email via DB
        const { data: profile } = await adminClient
          .from('profiles')
          .select('user_id')
          .eq('email', email)
          .single();

        if (profile) {
          userId = profile.user_id;
        } else {
          return { row: rowIndex, status: 'error', error: `User exists but profile not found for: ${email}` };
        }
      } else {
        return { row: rowIndex, status: 'error', error: `Auth error: ${authError.message}` };
      }
    } else {
      userId = authData.user.id;
    }

    // Step 2: Upsert profile
    await adminClient.from('profiles').upsert(
      { user_id: userId, email, full_name: fullName },
      { onConflict: 'user_id' },
    );

    // Step 3: Upsert hospital membership
    await adminClient.from('hospital_memberships').upsert(
      { hospital_id: hospitalId, user_id: userId, role: 'DOCTOR', status: 'ACTIVE' },
      { onConflict: 'hospital_id,user_id' },
    );

    // Step 4: Upsert doctor profile
    const doctorData: Record<string, any> = {
      user_id: userId,
      hospital_id: hospitalId,
    };

    const profileFields = DOCTOR_COLUMNS.filter(c => c.column !== 'email' && c.column !== 'full_name');
    for (const col of profileFields) {
      if (mapped[col.column] !== undefined && mapped[col.column] !== '') {
        doctorData[col.column] = this.castValue(mapped[col.column], col);
      }
    }

    const { data: doctorProfile, error: dpError } = await adminClient
      .from('doctor_profiles')
      .upsert(doctorData, { onConflict: 'user_id,hospital_id' })
      .select('id')
      .single();

    if (dpError) {
      return { row: rowIndex, status: 'error', error: `Doctor profile error: ${dpError.message}` };
    }

    return { row: rowIndex, status: 'success', data: { id: doctorProfile?.id, email, fullName } };
  }

  // ─── Mapping CRUD ─────────────────────────────────────────────

  async getMappings(hospitalId: string, entityType?: string) {
    const adminClient = this.getAdminClient();
    let query = adminClient
      .from('import_mappings')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });

    if (entityType) query = query.eq('entity_type', entityType);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data || [];
  }

  async saveMapping(
    hospitalId: string,
    entityType: string,
    name: string,
    mappingJson: Record<string, string>,
    createdBy: string,
  ) {
    const adminClient = this.getAdminClient();
    const { data, error } = await adminClient
      .from('import_mappings')
      .insert({ hospital_id: hospitalId, entity_type: entityType, name, mapping_json: mappingJson, created_by: createdBy })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateMapping(id: string, updates: { name?: string; mappingJson?: Record<string, string> }) {
    const adminClient = this.getAdminClient();
    const updateData: Record<string, any> = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.mappingJson) updateData.mapping_json = updates.mappingJson;

    const { data, error } = await adminClient
      .from('import_mappings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async deleteMapping(id: string) {
    const adminClient = this.getAdminClient();
    const { error } = await adminClient
      .from('import_mappings')
      .delete()
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private applyMapping(row: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [excelCol, dbCol] of Object.entries(mapping)) {
      if (dbCol && row[excelCol] !== undefined) {
        result[dbCol] = row[excelCol];
      }
    }
    return result;
  }

  private castValue(value: any, col: ImportColumn): any {
    if (value === '' || value === null || value === undefined) return null;
    const str = String(value).trim();
    if (!str) return null;

    switch (col.type) {
      case 'number':
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
      case 'date':
        // Already converted to YYYY-MM-DD in parse step if it was a Date
        return str;
      case 'enum':
        const lower = str.toLowerCase();
        if (col.options?.includes(lower)) return lower;
        return str;
      default:
        return str;
    }
  }

  private generatePassword(): string {
    return 'Temp' + randomBytes(6).toString('hex') + '!';
  }
}

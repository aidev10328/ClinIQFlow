import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  LegalRequirementDto,
  LegalDocumentDto,
  AcceptanceRecordDto,
  AcceptanceStatsDto,
  RequirementStatus,
  CreateDocumentDto,
  UpdateDocumentDto,
} from './dto/legal.dto';

@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get admin client with null check
   */
  private getAdminClientOrThrow() {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not configured');
    }
    return adminClient;
  }

  /**
   * Get user's legal requirements for a specific hospital
   */
  async getRequirements(
    userId: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<LegalRequirementDto[]> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Get user's role in this hospital
    const { data: membership, error: membershipError } = await supabase
      .from('hospital_memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'ACTIVE')
      .single();

    if (membershipError || !membership) {
      // User might be super admin without explicit membership
      const adminClient = this.getAdminClientOrThrow();
      const { data: profile } = await adminClient
        .from('profiles')
        .select('is_super_admin')
        .eq('user_id', userId)
        .single();

      if (profile?.is_super_admin) {
        // Super admins don't have legal requirements
        return [];
      }

      throw new ForbiddenException('Not a member of this hospital');
    }

    const userRole = membership.role;

    // Super admins don't have legal requirements
    if (userRole === 'SUPER_ADMIN') {
      return [];
    }

    // Get required documents for this user's role
    const { data: requiredDocs, error: reqError } = await supabase
      .from('hospital_required_documents')
      .select(`
        doc_id,
        required_for_role,
        legal_documents (
          id,
          doc_type,
          region,
          version,
          title,
          is_active,
          effective_at
        )
      `)
      .eq('hospital_id', hospitalId)
      .eq('required_for_role', userRole);

    if (reqError) {
      this.logger.error(`Failed to get required docs: ${reqError.message}`);
      throw new BadRequestException('Failed to get legal requirements');
    }

    // Get user's acceptances for this hospital
    const { data: acceptances, error: accError } = await supabase
      .from('document_acceptances')
      .select('doc_id, accepted_at')
      .eq('hospital_id', hospitalId)
      .eq('user_id', userId);

    if (accError) {
      this.logger.error(`Failed to get acceptances: ${accError.message}`);
    }

    const acceptanceMap = new Map(
      (acceptances || []).map((a) => [a.doc_id, a.accepted_at])
    );

    // Build requirements list
    const requirements: LegalRequirementDto[] = [];

    for (const req of requiredDocs || []) {
      const doc = req.legal_documents as any;
      if (!doc || !doc.is_active) continue;

      // Only include docs that are effective
      const effectiveAt = new Date(doc.effective_at);
      if (effectiveAt > new Date()) continue;

      const acceptedAt = acceptanceMap.get(doc.id);

      requirements.push({
        docId: doc.id,
        docType: doc.doc_type,
        title: doc.title,
        region: doc.region,
        version: doc.version,
        effectiveAt: doc.effective_at,
        requiredForRole: req.required_for_role,
        status: acceptedAt ? RequirementStatus.ACCEPTED : RequirementStatus.PENDING,
        acceptedAt: acceptedAt || undefined,
      });
    }

    return requirements;
  }

  /**
   * Check if user has pending requirements (used by guard)
   */
  async hasPendingRequirements(
    userId: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<boolean> {
    const requirements = await this.getRequirements(userId, hospitalId, accessToken);
    return requirements.some((r) => r.status === RequirementStatus.PENDING);
  }

  /**
   * Get a specific legal document
   */
  async getDocument(
    docId: string,
    userId: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<LegalDocumentDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify user can access this document (RLS should handle this, but double-check)
    const { data: doc, error } = await supabase
      .from('legal_documents')
      .select('id, title, content_markdown, version, doc_type, region, effective_at')
      .eq('id', docId)
      .single();

    if (error || !doc) {
      throw new NotFoundException('Document not found or access denied');
    }

    return {
      docId: doc.id,
      title: doc.title,
      contentMarkdown: doc.content_markdown,
      version: doc.version,
      docType: doc.doc_type,
      region: doc.region,
      effectiveAt: doc.effective_at,
    };
  }

  /**
   * Accept a legal document
   */
  async acceptDocument(
    docId: string,
    signatureName: string,
    userId: string,
    userEmail: string,
    hospitalId: string,
    accessToken: string,
    ipAddress: string | null,
    userAgent: string | null,
    signatureDataUrl?: string,
    signatureMode?: string,
  ): Promise<LegalRequirementDto[]> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Get user's role in this hospital
    const { data: membership, error: membershipError } = await supabase
      .from('hospital_memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'ACTIVE')
      .single();

    if (membershipError || !membership) {
      throw new ForbiddenException('Not a member of this hospital');
    }

    // Verify the document is required for this user
    const requirements = await this.getRequirements(userId, hospitalId, accessToken);
    const requirement = requirements.find((r) => r.docId === docId);

    if (!requirement) {
      throw new BadRequestException('Document is not required for you');
    }

    if (requirement.status === RequirementStatus.ACCEPTED) {
      // Already accepted, just return current state
      return requirements;
    }

    // Insert acceptance (upsert to handle race conditions)
    const { error: insertError } = await supabase
      .from('document_acceptances')
      .upsert({
        doc_id: docId,
        hospital_id: hospitalId,
        user_id: userId,
        role_at_acceptance: membership.role,
        acceptance_method: 'CLICK_WRAP',
        ip_address: ipAddress,
        user_agent: userAgent,
        signature_name: signatureName,
        signature_email: userEmail,
        signature_data_url: signatureDataUrl || null,
        signature_mode: signatureMode || 'type',
        accepted_at: new Date().toISOString(),
      }, {
        onConflict: 'doc_id,hospital_id,user_id',
        ignoreDuplicates: true,
      });

    if (insertError) {
      this.logger.error(`Failed to accept document: ${insertError.message}`);
      throw new BadRequestException('Failed to accept document');
    }

    this.logger.log(`User ${userId} accepted document ${docId} for hospital ${hospitalId}`);

    // Return updated requirements
    return this.getRequirements(userId, hospitalId, accessToken);
  }

  /**
   * Ensure required documents for a hospital (admin function)
   */
  async ensureHospitalRequiredDocs(hospitalId: string): Promise<void> {
    const adminClient = this.getAdminClientOrThrow();

    const { error } = await adminClient.rpc('ensure_hospital_required_docs', {
      p_hospital: hospitalId,
    });

    if (error) {
      this.logger.error(`Failed to ensure hospital docs: ${error.message}`);
      throw new BadRequestException('Failed to ensure hospital required documents');
    }

    this.logger.log(`Ensured required documents for hospital ${hospitalId}`);
  }

  /**
   * Ensure required documents for ALL hospitals (admin function)
   */
  async ensureAllHospitalsRequiredDocs(): Promise<{ processed: number }> {
    const adminClient = this.getAdminClientOrThrow();

    const { data: hospitals, error: listError } = await adminClient
      .from('hospitals')
      .select('id');

    if (listError) {
      throw new BadRequestException('Failed to list hospitals');
    }

    let processed = 0;
    for (const hospital of hospitals || []) {
      try {
        await this.ensureHospitalRequiredDocs(hospital.id);
        processed++;
      } catch (e) {
        this.logger.error(`Failed to process hospital ${hospital.id}: ${e.message}`);
      }
    }

    return { processed };
  }

  // =========================================
  // Admin functions for document management
  // =========================================

  /**
   * List all legal documents (admin)
   */
  async listDocuments(accessToken: string): Promise<any[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient
      .from('legal_documents')
      .select('*')
      .order('doc_type')
      .order('region')
      .order('effective_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to list documents');
    }

    return data || [];
  }

  /**
   * Create a new document version (admin)
   */
  async createDocument(dto: CreateDocumentDto): Promise<any> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient
      .from('legal_documents')
      .insert({
        doc_type: dto.docType,
        region: dto.region,
        version: dto.version,
        title: dto.title,
        content_markdown: dto.contentMarkdown,
        is_active: dto.isActive ?? true,
        effective_at: dto.effectiveAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create document: ${error.message}`);
      throw new BadRequestException(`Failed to create document: ${error.message}`);
    }

    return data;
  }

  /**
   * Update a document (admin)
   */
  async updateDocument(docId: string, dto: UpdateDocumentDto): Promise<any> {
    const adminClient = this.getAdminClientOrThrow();

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.contentMarkdown !== undefined) updateData.content_markdown = dto.contentMarkdown;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;
    if (dto.effectiveAt !== undefined) updateData.effective_at = dto.effectiveAt;

    const { data, error } = await adminClient
      .from('legal_documents')
      .update(updateData)
      .eq('id', docId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update document: ${error.message}`);
    }

    return data;
  }

  /**
   * Get acceptance statistics by hospital (admin)
   */
  async getAcceptanceStats(): Promise<AcceptanceStatsDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    // Get all hospitals
    const { data: hospitals, error: hospError } = await adminClient
      .from('hospitals')
      .select('id, name, region');

    if (hospError) {
      throw new BadRequestException('Failed to list hospitals');
    }

    const stats: AcceptanceStatsDto[] = [];

    for (const hospital of hospitals || []) {
      // Get managers and their acceptance status
      const { data: managerMemberships } = await adminClient
        .from('hospital_memberships')
        .select('user_id')
        .eq('hospital_id', hospital.id)
        .eq('role', 'HOSPITAL_MANAGER')
        .eq('status', 'ACTIVE');

      // Get doctors and their acceptance status
      const { data: doctorMemberships } = await adminClient
        .from('hospital_memberships')
        .select('user_id')
        .eq('hospital_id', hospital.id)
        .eq('role', 'DOCTOR')
        .eq('status', 'ACTIVE');

      // Get required doc counts
      const { count: managerDocsRequired } = await adminClient
        .from('hospital_required_documents')
        .select('id', { count: 'exact', head: true })
        .eq('hospital_id', hospital.id)
        .eq('required_for_role', 'HOSPITAL_MANAGER');

      const { count: doctorDocsRequired } = await adminClient
        .from('hospital_required_documents')
        .select('id', { count: 'exact', head: true })
        .eq('hospital_id', hospital.id)
        .eq('required_for_role', 'DOCTOR');

      // Count managers who have accepted ALL required docs
      let managersAccepted = 0;
      for (const m of managerMemberships || []) {
        const { count: acceptedCount } = await adminClient
          .from('document_acceptances')
          .select('id', { count: 'exact', head: true })
          .eq('hospital_id', hospital.id)
          .eq('user_id', m.user_id);

        if ((acceptedCount || 0) >= (managerDocsRequired || 0)) {
          managersAccepted++;
        }
      }

      // Count doctors who have accepted ALL required docs
      let doctorsAccepted = 0;
      for (const d of doctorMemberships || []) {
        const { count: acceptedCount } = await adminClient
          .from('document_acceptances')
          .select('id', { count: 'exact', head: true })
          .eq('hospital_id', hospital.id)
          .eq('user_id', d.user_id);

        if ((acceptedCount || 0) >= (doctorDocsRequired || 0)) {
          doctorsAccepted++;
        }
      }

      const totalManagers = managerMemberships?.length || 0;
      const totalDoctors = doctorMemberships?.length || 0;

      stats.push({
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        region: hospital.region,
        managerAcceptance: {
          required: totalManagers,
          accepted: managersAccepted,
          percentage: totalManagers > 0 ? Math.round((managersAccepted / totalManagers) * 100) : 100,
        },
        doctorAcceptance: {
          required: totalDoctors,
          accepted: doctorsAccepted,
          percentage: totalDoctors > 0 ? Math.round((doctorsAccepted / totalDoctors) * 100) : 100,
        },
      });
    }

    return stats;
  }

  /**
   * Get acceptance records (admin)
   */
  async getAcceptanceRecords(hospitalId?: string): Promise<AcceptanceRecordDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    let query = adminClient
      .from('document_acceptances')
      .select(`
        id,
        doc_id,
        hospital_id,
        user_id,
        role_at_acceptance,
        accepted_at,
        acceptance_method,
        signature_name,
        legal_documents (
          title,
          doc_type
        ),
        hospitals (
          name
        )
      `)
      .order('accepted_at', { ascending: false })
      .limit(100);

    if (hospitalId) {
      query = query.eq('hospital_id', hospitalId);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException('Failed to get acceptance records');
    }

    // Get user emails
    const userIds = [...new Set((data || []).map((d) => d.user_id))];
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, email')
      .in('id', userIds);

    const emailMap = new Map((profiles || []).map((p) => [p.id, p.email]));

    return (data || []).map((record) => ({
      id: record.id,
      docId: record.doc_id,
      docTitle: (record.legal_documents as any)?.title || '',
      docType: (record.legal_documents as any)?.doc_type || '',
      hospitalId: record.hospital_id,
      hospitalName: (record.hospitals as any)?.name || '',
      userId: record.user_id,
      userEmail: emailMap.get(record.user_id) || '',
      roleAtAcceptance: record.role_at_acceptance,
      acceptedAt: record.accepted_at,
      acceptanceMethod: record.acceptance_method,
      signatureName: record.signature_name,
    }));
  }
}

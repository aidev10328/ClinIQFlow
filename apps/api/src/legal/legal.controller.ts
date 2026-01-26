import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { LegalService } from './legal.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AcceptDocumentDto,
  CreateDocumentDto,
  UpdateDocumentDto,
  EnsureHospitalDocsDto,
} from './dto/legal.dto';

@Controller('v1/legal')
export class LegalController {
  constructor(
    private readonly legalService: LegalService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Get legal requirements for current user in current hospital
   * Requires x-hospital-id header
   */
  @Get('requirements')
  @UseGuards(SupabaseGuard)
  async getRequirements(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException({
        code: 'HOSPITAL_CONTEXT_REQUIRED',
        message: 'x-hospital-id header is required',
      });
    }

    return this.legalService.getRequirements(
      req.user.id,
      hospitalId,
      req.accessToken,
    );
  }

  /**
   * Get a specific legal document
   * Requires x-hospital-id header
   */
  @Get('documents/:docId')
  @UseGuards(SupabaseGuard)
  async getDocument(
    @Param('docId') docId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException({
        code: 'HOSPITAL_CONTEXT_REQUIRED',
        message: 'x-hospital-id header is required',
      });
    }

    return this.legalService.getDocument(
      docId,
      req.user.id,
      hospitalId,
      req.accessToken,
    );
  }

  /**
   * Accept a legal document
   * Requires x-hospital-id header
   */
  @Post('accept')
  @UseGuards(SupabaseGuard)
  async acceptDocument(
    @Body() dto: AcceptDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException({
        code: 'HOSPITAL_CONTEXT_REQUIRED',
        message: 'x-hospital-id header is required',
      });
    }

    if (!dto.acknowledged) {
      throw new BadRequestException('You must acknowledge the document');
    }

    // Validate signature based on mode
    const signatureMode = dto.signatureMode || 'type';
    if (signatureMode === 'type' && !dto.signatureName?.trim()) {
      throw new BadRequestException('Signature name is required');
    }
    if (signatureMode === 'draw' && !dto.signatureDataUrl) {
      throw new BadRequestException('Signature drawing is required');
    }

    // Get IP and user agent from request
    const ipAddress = req.headers['x-forwarded-for'] as string ||
                      req.headers['x-real-ip'] as string ||
                      (req as any).socket?.remoteAddress ||
                      (req as any).ip ||
                      null;
    const userAgent = req.headers['user-agent'] as string || null;

    return this.legalService.acceptDocument(
      dto.docId,
      dto.signatureName?.trim() || '',
      req.user.id,
      req.user.email,
      hospitalId,
      req.accessToken,
      ipAddress,
      userAgent,
      dto.signatureDataUrl,
      signatureMode,
    );
  }

  // =========================================
  // Admin endpoints (Super Admin only)
  // =========================================

  /**
   * Check if current user is super admin
   */
  private async requireSuperAdmin(userId: string): Promise<void> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin client not configured');
    }
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Super admin access required');
    }
  }

  /**
   * List all legal documents (admin)
   */
  @Get('admin/documents')
  @UseGuards(SupabaseGuard)
  async listDocuments(@Req() req: AuthenticatedRequest) {
    await this.requireSuperAdmin(req.user.id);
    return this.legalService.listDocuments(req.accessToken);
  }

  /**
   * Create a new document version (admin)
   */
  @Post('admin/documents')
  @UseGuards(SupabaseGuard)
  async createDocument(
    @Body() dto: CreateDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.legalService.createDocument(dto);
  }

  /**
   * Update a document (admin)
   */
  @Patch('admin/documents/:docId')
  @UseGuards(SupabaseGuard)
  async updateDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.legalService.updateDocument(docId, dto);
  }

  /**
   * Ensure required documents for a specific hospital (admin)
   */
  @Post('admin/ensure-hospital-docs')
  @UseGuards(SupabaseGuard)
  async ensureHospitalDocs(
    @Body() dto: EnsureHospitalDocsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    await this.legalService.ensureHospitalRequiredDocs(dto.hospitalId);
    return { success: true, hospitalId: dto.hospitalId };
  }

  /**
   * Ensure required documents for ALL hospitals (admin)
   */
  @Post('admin/ensure-all-hospitals-docs')
  @UseGuards(SupabaseGuard)
  async ensureAllHospitalsDocs(@Req() req: AuthenticatedRequest) {
    await this.requireSuperAdmin(req.user.id);
    return this.legalService.ensureAllHospitalsRequiredDocs();
  }

  /**
   * Get acceptance statistics by hospital (admin)
   */
  @Get('admin/stats')
  @UseGuards(SupabaseGuard)
  async getAcceptanceStats(@Req() req: AuthenticatedRequest) {
    await this.requireSuperAdmin(req.user.id);
    return this.legalService.getAcceptanceStats();
  }

  /**
   * Get acceptance records (admin)
   */
  @Get('admin/acceptances')
  @UseGuards(SupabaseGuard)
  async getAcceptanceRecords(
    @Query('hospitalId') hospitalId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.legalService.getAcceptanceRecords(hospitalId);
  }
}

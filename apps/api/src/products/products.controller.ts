import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
  ValidateDiscountDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  AssignLicenseDto,
  BulkAssignLicensesDto,
  RevokeLicenseDto,
  ProductCode,
  Region,
} from './dto/products.dto';

@Controller('v1/products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // =========================================
  // Helper: Check Super Admin
  // =========================================

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

  private async requireHospitalManager(
    userId: string,
    hospitalId: string,
  ): Promise<void> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin client not configured');
    }

    // Check if super admin first
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (profile?.is_super_admin) {
      return; // Super admins can do everything
    }

    // Check hospital manager role
    const { data: membership } = await adminClient
      .from('hospital_memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'ACTIVE')
      .single();

    if (!membership || membership.role !== 'HOSPITAL_MANAGER') {
      throw new ForbiddenException('Hospital manager access required');
    }
  }

  // =========================================
  // Public: Products & Pricing
  // =========================================

  /**
   * List all products with pricing
   */
  @Get()
  @UseGuards(SupabaseGuard)
  async listProducts(@Query('region') region?: Region) {
    return this.productsService.getProductsWithPricing(region);
  }

  /**
   * Get pricing for a specific region
   */
  @Get('pricing/:region')
  @UseGuards(SupabaseGuard)
  async getPricing(@Param('region') region: Region) {
    return this.productsService.getPricingForRegion(region);
  }

  // =========================================
  // Admin: Product Management
  // =========================================

  /**
   * Create a new product (super admin)
   */
  @Post('admin/products')
  @UseGuards(SupabaseGuard)
  async createProduct(
    @Body() dto: { code: string; name: string; description?: string; features?: string[]; isActive?: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.createProduct(dto);
  }

  /**
   * Update a product (super admin)
   */
  @Patch('admin/products/:id')
  @UseGuards(SupabaseGuard)
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; features?: string[]; isActive?: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.updateProduct(id, dto);
  }

  /**
   * Update product pricing (super admin)
   */
  @Patch('admin/products/:productId/pricing/:region')
  @UseGuards(SupabaseGuard)
  async updateProductPricing(
    @Param('productId') productId: string,
    @Param('region') region: Region,
    @Body() dto: { pricePerDoctorPerMonth: number },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.updateProductPricing(productId, region, dto.pricePerDoctorPerMonth);
  }

  // =========================================
  // Public: Discount Validation
  // =========================================

  /**
   * Validate a discount code
   */
  @Post('discounts/validate')
  @UseGuards(SupabaseGuard)
  async validateDiscount(
    @Body() dto: ValidateDiscountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    // Get hospital region
    const adminClient = this.supabaseService.getAdminClient();
    const { data: hospital } = await adminClient!
      .from('hospitals')
      .select('region')
      .eq('id', hospitalId)
      .single();

    if (!hospital) {
      throw new BadRequestException('Hospital not found');
    }

    return this.productsService.validateDiscountCode(
      dto.code,
      dto.productCode,
      dto.doctorCount,
      hospital.region as Region,
    );
  }

  // =========================================
  // User: Entitlements
  // =========================================

  /**
   * Get current user's entitlements for current hospital
   */
  @Get('entitlements')
  @UseGuards(SupabaseGuard)
  async getMyEntitlements(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    return this.productsService.getUserEntitlements(req.user.id, hospitalId);
  }

  /**
   * Check if user can access a specific product
   */
  @Get('entitlements/check/:productCode')
  @UseGuards(SupabaseGuard)
  async checkAccess(
    @Param('productCode') productCode: ProductCode,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    const hasAccess = await this.productsService.canAccessProduct(
      hospitalId,
      req.user.id,
      productCode,
    );

    return { productCode, hasAccess };
  }

  // =========================================
  // Admin: Discount Codes
  // =========================================

  /**
   * List all discount codes (super admin)
   */
  @Get('admin/discounts')
  @UseGuards(SupabaseGuard)
  async listDiscounts(@Req() req: AuthenticatedRequest) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.listDiscountCodes();
  }

  /**
   * Create discount code (super admin)
   */
  @Post('admin/discounts')
  @UseGuards(SupabaseGuard)
  async createDiscount(
    @Body() dto: CreateDiscountCodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.createDiscountCode(dto);
  }

  /**
   * Update discount code (super admin)
   */
  @Patch('admin/discounts/:id')
  @UseGuards(SupabaseGuard)
  async updateDiscount(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountCodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.updateDiscountCode(id, dto);
  }

  // =========================================
  // Admin: Subscriptions
  // =========================================

  /**
   * List all subscriptions (super admin)
   */
  @Get('admin/subscriptions')
  @UseGuards(SupabaseGuard)
  async listSubscriptions(@Req() req: AuthenticatedRequest) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.listAllSubscriptions();
  }

  /**
   * Get subscription stats (super admin)
   */
  @Get('admin/subscriptions/stats')
  @UseGuards(SupabaseGuard)
  async getSubscriptionStats(@Req() req: AuthenticatedRequest) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.getSubscriptionStats();
  }

  /**
   * Create subscription for a hospital (super admin)
   */
  @Post('admin/subscriptions')
  @UseGuards(SupabaseGuard)
  async createSubscription(
    @Body() dto: CreateSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.createSubscription(dto);
  }

  /**
   * Update subscription (super admin)
   */
  @Patch('admin/subscriptions/:hospitalId')
  @UseGuards(SupabaseGuard)
  async updateSubscription(
    @Param('hospitalId') hospitalId: string,
    @Body() dto: UpdateSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireSuperAdmin(req.user.id);
    return this.productsService.updateSubscription(hospitalId, dto);
  }

  // =========================================
  // Manager: Hospital Subscription
  // =========================================

  /**
   * Get current hospital's subscription (manager)
   */
  @Get('subscription')
  @UseGuards(SupabaseGuard)
  async getHospitalSubscription(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    return this.productsService.getHospitalSubscription(hospitalId);
  }

  /**
   * Get license stats for current hospital (manager)
   */
  @Get('subscription/license-stats')
  @UseGuards(SupabaseGuard)
  async getLicenseStats(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    return this.productsService.getLicenseStats(hospitalId);
  }

  /**
   * Cancel current hospital's subscription (manager)
   */
  @Post('subscription/cancel')
  @UseGuards(SupabaseGuard)
  async cancelSubscription(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    return this.productsService.cancelHospitalSubscription(hospitalId);
  }

  // =========================================
  // Manager: License Management
  // =========================================

  /**
   * Get all licenses for current hospital (manager)
   */
  @Get('licenses')
  @UseGuards(SupabaseGuard)
  async getHospitalLicenses(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    return this.productsService.getHospitalLicenses(hospitalId);
  }

  /**
   * Assign license to a doctor (manager)
   */
  @Post('licenses/assign')
  @UseGuards(SupabaseGuard)
  async assignLicense(
    @Body() dto: AssignLicenseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    return this.productsService.assignLicense(hospitalId, dto, req.user.id);
  }

  /**
   * Bulk assign licenses to doctors (manager)
   */
  @Post('licenses/assign-bulk')
  @UseGuards(SupabaseGuard)
  async bulkAssignLicenses(
    @Body() dto: BulkAssignLicensesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    return this.productsService.bulkAssignLicenses(hospitalId, dto, req.user.id);
  }

  /**
   * Revoke a license (manager)
   */
  @Delete('licenses/:licenseId')
  @UseGuards(SupabaseGuard)
  async revokeLicense(
    @Param('licenseId') licenseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.requireHospitalManager(req.user.id, hospitalId);
    await this.productsService.revokeLicense(hospitalId, licenseId);
    return { success: true };
  }
}

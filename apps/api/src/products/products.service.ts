import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ProductDto,
  ProductWithPricingDto,
  ProductPricingDto,
  ProductCode,
  DiscountCodeDto,
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
  DiscountValidationResultDto,
  DiscountType,
  HospitalSubscriptionDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionStatus,
  DoctorLicenseDto,
  AssignLicenseDto,
  BulkAssignLicensesDto,
  LicenseStatus,
  UserEntitlementsDto,
  SubscriptionStatsDto,
  LicenseStatsDto,
  Region,
} from './dto/products.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private getAdminClientOrThrow() {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not configured');
    }
    return adminClient;
  }

  // =========================================
  // Products Management (Super Admin)
  // =========================================

  async createProduct(dto: {
    code: string;
    name: string;
    description?: string;
    features?: string[];
    isActive?: boolean;
  }): Promise<ProductDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Check for duplicate code
    const { data: existing } = await adminClient
      .from('products')
      .select('id')
      .eq('code', dto.code.toUpperCase())
      .single();

    if (existing) {
      throw new BadRequestException('Product code already exists');
    }

    const { data, error } = await adminClient
      .from('products')
      .insert({
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description || '',
        metadata: { features: dto.features || [] },
        is_active: dto.isActive ?? true,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create product: ${error.message}`);
      throw new BadRequestException(`Failed to create product: ${error.message}`);
    }

    return this.mapProduct(data);
  }

  async updateProduct(
    id: string,
    dto: {
      name?: string;
      description?: string;
      features?: string[];
      isActive?: boolean;
    },
  ): Promise<ProductDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get existing product to preserve metadata
    const { data: existing } = await adminClient
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;
    if (dto.features !== undefined) {
      updateData.metadata = { ...existing.metadata, features: dto.features };
    }

    const { data, error } = await adminClient
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update product: ${error.message}`);
      throw new BadRequestException(`Failed to update product: ${error.message}`);
    }

    return this.mapProduct(data);
  }

  async updateProductPricing(
    productId: string,
    region: Region,
    pricePerDoctorPerMonth: number,
  ): Promise<ProductPricingDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Check if pricing exists for this product/region
    const { data: existing } = await adminClient
      .from('product_pricing')
      .select('id')
      .eq('product_id', productId)
      .eq('region', region)
      .single();

    const currencyMap: Record<string, string> = { US: 'USD', UK: 'GBP', IN: 'INR' };
    const currency = currencyMap[region] || 'USD';

    if (existing) {
      // Update existing pricing
      const { data, error } = await adminClient
        .from('product_pricing')
        .update({
          price_per_doctor_monthly: pricePerDoctorPerMonth,
          currency,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new BadRequestException(`Failed to update pricing: ${error.message}`);
      }

      return this.mapPricing(data);
    } else {
      // Create new pricing
      const { data, error } = await adminClient
        .from('product_pricing')
        .insert({
          product_id: productId,
          region,
          currency,
          price_per_doctor_monthly: pricePerDoctorPerMonth,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        throw new BadRequestException(`Failed to create pricing: ${error.message}`);
      }

      return this.mapPricing(data);
    }
  }

  // =========================================
  // Products (Read)
  // =========================================

  async listProducts(): Promise<ProductDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient
      .from('products')
      .select('*')
      .order('name');

    if (error) {
      this.logger.error(`Failed to list products: ${error.message}`);
      throw new BadRequestException('Failed to list products');
    }

    return (data || []).map(this.mapProduct);
  }

  async getProductsWithPricing(region?: Region): Promise<ProductWithPricingDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data: products, error: prodError } = await adminClient
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (prodError) {
      throw new BadRequestException('Failed to list products');
    }

    let pricingQuery = adminClient
      .from('product_pricing')
      .select('*')
      .eq('is_active', true);

    if (region) {
      pricingQuery = pricingQuery.eq('region', region);
    }

    const { data: pricing, error: priceError } = await pricingQuery;

    if (priceError) {
      throw new BadRequestException('Failed to get pricing');
    }

    return (products || []).map((p) => ({
      ...this.mapProduct(p),
      pricing: (pricing || [])
        .filter((pr) => pr.product_id === p.id)
        .map(this.mapPricing),
    }));
  }

  async getPricingForRegion(region: Region): Promise<ProductPricingDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient
      .from('product_pricing')
      .select('*, products(*)')
      .eq('region', region)
      .eq('is_active', true);

    if (error) {
      throw new BadRequestException('Failed to get pricing');
    }

    return (data || []).map(this.mapPricing);
  }

  // =========================================
  // Discount Codes (Super Admin)
  // =========================================

  async listDiscountCodes(): Promise<DiscountCodeDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to list discount codes');
    }

    return (data || []).map(this.mapDiscountCode);
  }

  async createDiscountCode(dto: CreateDiscountCodeDto): Promise<DiscountCodeDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Check for duplicate code
    const { data: existing } = await adminClient
      .from('discount_codes')
      .select('id')
      .eq('code', dto.code.toUpperCase())
      .single();

    if (existing) {
      throw new BadRequestException('Discount code already exists');
    }

    const { data, error } = await adminClient
      .from('discount_codes')
      .insert({
        code: dto.code.toUpperCase(),
        discount_type: dto.discountType,
        discount_value: dto.discountValue,
        description: dto.description || '',
        is_active: dto.isActive ?? true,
        max_redemptions: dto.maxRedemptions || null,
        valid_from: dto.validFrom || new Date().toISOString(),
        valid_until: dto.validUntil || null,
        min_doctors: dto.minDoctors || null,
        max_doctors: dto.maxDoctors || null,
        applicable_products: dto.applicableProducts || [],
        applicable_regions: dto.applicableRegions || [],
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create discount code: ${error.message}`);
      throw new BadRequestException(`Failed to create discount code: ${error.message}`);
    }

    return this.mapDiscountCode(data);
  }

  async updateDiscountCode(id: string, dto: UpdateDiscountCodeDto): Promise<DiscountCodeDto> {
    const adminClient = this.getAdminClientOrThrow();

    const updateData: any = {};
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;
    if (dto.discountValue !== undefined) updateData.discount_value = dto.discountValue;
    if (dto.maxRedemptions !== undefined) updateData.max_redemptions = dto.maxRedemptions;
    if (dto.validUntil !== undefined) updateData.valid_until = dto.validUntil;
    if (dto.minDoctors !== undefined) updateData.min_doctors = dto.minDoctors;
    if (dto.maxDoctors !== undefined) updateData.max_doctors = dto.maxDoctors;
    if (dto.applicableProducts !== undefined) updateData.applicable_products = dto.applicableProducts;
    if (dto.applicableRegions !== undefined) updateData.applicable_regions = dto.applicableRegions;

    const { data, error } = await adminClient
      .from('discount_codes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update discount code: ${error.message}`);
    }

    return this.mapDiscountCode(data);
  }

  async validateDiscountCode(
    code: string,
    productCode: ProductCode,
    doctorCount: number,
    region: Region,
  ): Promise<DiscountValidationResultDto> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient.rpc('validate_discount_code', {
      p_code: code.toUpperCase(),
      p_product_code: productCode,
      p_doctor_count: doctorCount,
      p_region: region,
    });

    if (error) {
      this.logger.error(`Discount validation error: ${error.message}`);
      return { isValid: false, errorMessage: 'Validation failed' };
    }

    if (!data || !data.is_valid) {
      return {
        isValid: false,
        errorMessage: data?.error_message || 'Invalid discount code',
      };
    }

    return {
      isValid: true,
      discountType: data.discount_type as DiscountType,
      discountValue: data.discount_value,
    };
  }

  // =========================================
  // Subscriptions (Super Admin + Manager)
  // =========================================

  async listAllSubscriptions(): Promise<HospitalSubscriptionDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data: subscriptions, error } = await adminClient
      .from('hospital_subscriptions')
      .select(`
        *,
        hospitals (id, name, region, currency)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`[listAllSubscriptions] Failed to list: ${error.message}`);
      throw new BadRequestException('Failed to list subscriptions');
    }

    this.logger.log(`[listAllSubscriptions] Found ${subscriptions?.length || 0} subscriptions`);

    // Get items for all subscriptions
    const subscriptionIds = (subscriptions || []).map((s) => s.id);
    this.logger.log(`[listAllSubscriptions] Fetching items for subscription IDs: ${JSON.stringify(subscriptionIds)}`);

    const { data: items, error: itemsError } = await adminClient
      .from('hospital_subscription_items')
      .select(`
        *,
        products (code, name)
      `)
      .in('subscription_id', subscriptionIds);

    if (itemsError) {
      this.logger.error(`[listAllSubscriptions] Items error: ${itemsError.message}`);
    }
    this.logger.log(`[listAllSubscriptions] Found ${items?.length || 0} items total`);

    return (subscriptions || []).map((sub) => {
      const subItems = (items || []).filter((i) => i.subscription_id === sub.id);
      this.logger.log(`[listAllSubscriptions] Sub ${sub.id} has ${subItems.length} items`);
      return this.mapSubscription(sub, subItems);
    });
  }

  async getHospitalSubscription(hospitalId: string): Promise<HospitalSubscriptionDto | null> {
    const adminClient = this.getAdminClientOrThrow();

    this.logger.debug(`[getHospitalSubscription] Fetching subscription for hospital: ${hospitalId}`);

    const { data: subscription, error } = await adminClient
      .from('hospital_subscriptions')
      .select(`
        *,
        hospitals (id, name, region, currency)
      `)
      .eq('hospital_id', hospitalId)
      .in('status', ['ACTIVE', 'TRIAL', 'PAST_DUE'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      this.logger.debug(`[getHospitalSubscription] Subscription query error: ${error.message}`);
      return null;
    }

    if (!subscription) {
      this.logger.debug(`[getHospitalSubscription] No subscription found for hospital: ${hospitalId}`);
      return null;
    }

    this.logger.debug(`[getHospitalSubscription] Found subscription: ${subscription.id}, status: ${subscription.status}`);

    const { data: items, error: itemsError } = await adminClient
      .from('hospital_subscription_items')
      .select(`
        *,
        products (code, name)
      `)
      .eq('subscription_id', subscription.id);

    if (itemsError) {
      this.logger.error(`[getHospitalSubscription] Items query error: ${itemsError.message}`);
    }

    this.logger.debug(`[getHospitalSubscription] Found ${items?.length || 0} subscription items`);

    return this.mapSubscription(subscription, items || []);
  }

  async cancelHospitalSubscription(hospitalId: string): Promise<{ success: boolean }> {
    const adminClient = this.getAdminClientOrThrow();

    const subscription = await this.getHospitalSubscription(hospitalId);
    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    const { error } = await adminClient
      .from('hospital_subscriptions')
      .update({
        status: 'CANCELED',
        canceled_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    if (error) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`);
      throw new BadRequestException('Failed to cancel subscription');
    }

    return { success: true };
  }

  async createSubscription(dto: CreateSubscriptionDto): Promise<HospitalSubscriptionDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get hospital region for pricing
    const { data: hospital, error: hospError } = await adminClient
      .from('hospitals')
      .select('id, name, region, currency')
      .eq('id', dto.hospitalId)
      .single();

    if (hospError || !hospital) {
      throw new NotFoundException('Hospital not found');
    }

    // Check no active subscription
    const existing = await this.getHospitalSubscription(dto.hospitalId);
    if (existing) {
      throw new BadRequestException('Hospital already has an active subscription');
    }

    // Calculate dates
    const now = new Date();
    const startedAt = now.toISOString();
    const renewsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const trialEndsAt = dto.startTrial
      ? new Date(Date.now() + (dto.trialDays || 14) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Get currency for region
    const region = hospital.region as Region;
    const currencyMap: Record<string, string> = { US: 'USD', UK: 'GBP', IN: 'INR' };
    const currency = currencyMap[region] || 'USD';

    // Create subscription
    const { data: subscription, error: subError } = await adminClient
      .from('hospital_subscriptions')
      .insert({
        hospital_id: dto.hospitalId,
        status: dto.startTrial ? 'TRIAL' : 'ACTIVE',
        region: region,
        currency: currency,
        started_at: startedAt,
        renews_at: renewsAt,
        trial_ends_at: trialEndsAt,
      })
      .select()
      .single();

    if (subError) {
      throw new BadRequestException(`Failed to create subscription: ${subError.message}`);
    }

    // Get pricing for hospital region
    const { data: pricing } = await adminClient
      .from('product_pricing')
      .select('*, products(id, code)')
      .eq('region', region)
      .eq('is_active', true);

    // Create subscription items
    for (const item of dto.items) {
      const productPricing = (pricing || []).find(
        (p) => (p.products as any).code === item.productCode,
      );

      if (!productPricing) {
        throw new BadRequestException(`No pricing found for product ${item.productCode} in region ${region}`);
      }

      if (item.discountCode) {
        const validation = await this.validateDiscountCode(
          item.discountCode,
          item.productCode,
          item.doctorLimit,
          region,
        );

        if (validation.isValid) {
          const { data: discountData } = await adminClient
            .from('discount_codes')
            .select('id, used_count')
            .eq('code', item.discountCode.toUpperCase())
            .single();

          if (discountData) {
            // Record redemption
            await adminClient.from('discount_redemptions').insert({
              discount_code_id: discountData.id,
              hospital_id: dto.hospitalId,
            });

            // Increment used_count
            await adminClient
              .from('discount_codes')
              .update({ used_count: (discountData.used_count || 0) + 1 })
              .eq('id', discountData.id);
          }
        }
      }

      await adminClient.from('hospital_subscription_items').insert({
        subscription_id: subscription.id,
        product_id: (productPricing.products as any).id,
        quantity_doctors: item.doctorLimit,
        unit_price: productPricing.price_per_doctor_monthly,
        status: dto.startTrial ? 'TRIAL' : 'ACTIVE',
      });
    }

    return (await this.getHospitalSubscription(dto.hospitalId))!;
  }

  async updateSubscription(
    hospitalId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<HospitalSubscriptionDto> {
    const adminClient = this.getAdminClientOrThrow();
    this.logger.log(`[updateSubscription] Updating subscription for hospital ${hospitalId}`);
    this.logger.log(`[updateSubscription] DTO: ${JSON.stringify(dto)}`);

    const existing = await this.getHospitalSubscription(hospitalId);
    if (!existing) {
      this.logger.warn(`[updateSubscription] No active subscription found for hospital ${hospitalId}`);
      throw new NotFoundException('No active subscription found');
    }
    this.logger.log(`[updateSubscription] Found existing subscription: ${existing.id}`);

    // Update status if provided
    if (dto.status) {
      this.logger.log(`[updateSubscription] Updating status to: ${dto.status}`);
      const updateData: any = { status: dto.status };
      if (dto.status === SubscriptionStatus.CANCELLED) {
        updateData.canceled_at = new Date().toISOString();
      }

      const { error: statusError } = await adminClient
        .from('hospital_subscriptions')
        .update(updateData)
        .eq('id', existing.id);

      if (statusError) {
        this.logger.error(`[updateSubscription] Failed to update status: ${statusError.message}`);
        throw new BadRequestException(`Failed to update status: ${statusError.message}`);
      }
    }

    // Update items if provided
    if (dto.items && dto.items.length > 0) {
      this.logger.log(`[updateSubscription] Updating ${dto.items.length} items`);

      // Get hospital for region
      const { data: hospital } = await adminClient
        .from('hospitals')
        .select('region')
        .eq('id', hospitalId)
        .single();

      const region = hospital?.region as Region;
      this.logger.log(`[updateSubscription] Hospital region: ${region}`);

      // Get pricing
      const { data: pricing, error: pricingError } = await adminClient
        .from('product_pricing')
        .select('*, products(id, code)')
        .eq('region', region)
        .eq('is_active', true);

      if (pricingError) {
        this.logger.error(`[updateSubscription] Failed to fetch pricing: ${pricingError.message}`);
        throw new BadRequestException(`Failed to fetch pricing: ${pricingError.message}`);
      }
      this.logger.log(`[updateSubscription] Found ${pricing?.length || 0} pricing entries for region ${region}`);

      // Validate all items have pricing before deleting
      for (const item of dto.items) {
        const productPricing = (pricing || []).find(
          (p) => (p.products as any).code === item.productCode,
        );
        if (!productPricing) {
          this.logger.error(`[updateSubscription] No pricing for ${item.productCode} in region ${region}`);
          throw new BadRequestException(`No pricing for ${item.productCode} in region ${region}`);
        }
      }

      // Delete existing items
      const { error: deleteError } = await adminClient
        .from('hospital_subscription_items')
        .delete()
        .eq('subscription_id', existing.id);

      if (deleteError) {
        this.logger.error(`[updateSubscription] Failed to delete items: ${deleteError.message}`);
        throw new BadRequestException(`Failed to delete existing items: ${deleteError.message}`);
      }

      // Create new items
      for (const item of dto.items) {
        const productPricing = (pricing || []).find(
          (p) => (p.products as any).code === item.productCode,
        );

        const { error: insertError } = await adminClient.from('hospital_subscription_items').insert({
          subscription_id: existing.id,
          product_id: (productPricing!.products as any).id,
          quantity_doctors: item.doctorLimit,
          unit_price: productPricing!.price_per_doctor_monthly,
          status: existing.status,
        });

        if (insertError) {
          this.logger.error(`[updateSubscription] Failed to insert item: ${insertError.message}`);
          throw new BadRequestException(`Failed to create subscription item: ${insertError.message}`);
        }
        this.logger.log(`[updateSubscription] Created item for ${item.productCode} with ${item.doctorLimit} doctors`);
      }
    }

    const result = await this.getHospitalSubscription(hospitalId);
    this.logger.log(`[updateSubscription] Update complete for hospital ${hospitalId}`);
    return result!;
  }

  // =========================================
  // Licenses (Hospital Manager)
  // =========================================

  async getHospitalLicenses(hospitalId: string): Promise<DoctorLicenseDto[]> {
    const adminClient = this.getAdminClientOrThrow();

    const { data: licenses, error } = await adminClient
      .from('doctor_product_licenses')
      .select(`
        *,
        products (code, name)
      `)
      .eq('hospital_id', hospitalId)
      .order('assigned_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to get licenses: ${error.message}`);
      throw new BadRequestException('Failed to get licenses');
    }

    if (!licenses || licenses.length === 0) {
      return [];
    }

    // Fetch profile info separately (no FK relationship exists)
    const doctorIds = [...new Set(licenses.map((l) => l.doctor_user_id))];
    const assignerIds = [...new Set(licenses.map((l) => l.assigned_by_user_id).filter(Boolean))];
    const allUserIds = [...new Set([...doctorIds, ...assignerIds])];

    const { data: profiles } = await adminClient
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', allUserIds);

    const profileMap = new Map<string, { full_name: string; email: string }>();
    for (const p of profiles || []) {
      profileMap.set(p.user_id, { full_name: p.full_name, email: p.email });
    }

    // Enrich licenses with profile info
    const enrichedLicenses = licenses.map((l) => ({
      ...l,
      profiles: profileMap.get(l.doctor_user_id),
      assigner: profileMap.get(l.assigned_by_user_id),
    }));

    return enrichedLicenses.map(this.mapLicense);
  }

  async assignLicense(
    hospitalId: string,
    dto: AssignLicenseDto,
    assignedBy: string,
  ): Promise<DoctorLicenseDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Verify doctor is a member of the hospital
    const { data: membership, error: memError } = await adminClient
      .from('hospital_memberships')
      .select('role')
      .eq('hospital_id', hospitalId)
      .eq('user_id', dto.doctorId)
      .eq('role', 'DOCTOR')
      .eq('status', 'ACTIVE')
      .single();

    if (memError || !membership) {
      throw new BadRequestException('User is not an active doctor at this hospital');
    }

    // Check subscription has available licenses
    const subscription = await this.getHospitalSubscription(hospitalId);
    if (!subscription) {
      throw new BadRequestException('Hospital has no active subscription');
    }

    const subItem = subscription.items.find((i) => i.productCode === dto.productCode);
    if (!subItem) {
      throw new BadRequestException(`Hospital is not subscribed to ${dto.productCode}`);
    }

    // Count current active licenses for this product
    const { count: activeLicenses } = await adminClient
      .from('doctor_product_licenses')
      .select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .eq('product_id', subItem.id)
      .eq('status', 'ACTIVE');

    if ((activeLicenses || 0) >= subItem.doctorLimit) {
      throw new BadRequestException('No available licenses. Please upgrade your subscription.');
    }

    // Check if doctor already has this license
    const { data: existingLicense } = await adminClient
      .from('doctor_product_licenses')
      .select('id, status')
      .eq('hospital_id', hospitalId)
      .eq('doctor_user_id', dto.doctorId)
      .eq('status', 'ACTIVE')
      .single();

    if (existingLicense) {
      throw new BadRequestException('Doctor already has an active license for this product');
    }

    // Get product ID
    const { data: product } = await adminClient
      .from('products')
      .select('id')
      .eq('code', dto.productCode)
      .single();

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // Create license
    const { data: license, error: licError } = await adminClient
      .from('doctor_product_licenses')
      .insert({
        hospital_id: hospitalId,
        doctor_user_id: dto.doctorId,
        product_id: product.id,
        status: 'ACTIVE',
        assigned_by_user_id: assignedBy,
      })
      .select(`
        *,
        products (code, name)
      `)
      .single();

    if (licError) {
      this.logger.error(`Failed to assign license: ${licError.message}`);
      throw new BadRequestException(`Failed to assign license: ${licError.message}`);
    }

    // Fetch profile info separately (no FK relationship exists)
    const { data: doctorProfile } = await adminClient
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', dto.doctorId)
      .single();

    const { data: assignerProfile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('user_id', assignedBy)
      .single();

    // Add profile info to license for mapping
    const enrichedLicense = {
      ...license,
      profiles: doctorProfile,
      assigner: assignerProfile,
    };

    this.logger.log(`License assigned: ${dto.productCode} to doctor ${dto.doctorId}`);
    return this.mapLicense(enrichedLicense);
  }

  async bulkAssignLicenses(
    hospitalId: string,
    dto: BulkAssignLicensesDto,
    assignedBy: string,
  ): Promise<{ assigned: number; failed: string[] }> {
    const results = await Promise.allSettled(
      dto.doctorIds.map((doctorId) =>
        this.assignLicense(hospitalId, { doctorId, productCode: dto.productCode }, assignedBy),
      ),
    );

    const failed: string[] = [];
    let assigned = 0;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        assigned++;
      } else {
        failed.push(dto.doctorIds[i]);
      }
    });

    return { assigned, failed };
  }

  async revokeLicense(hospitalId: string, licenseId: string): Promise<void> {
    const adminClient = this.getAdminClientOrThrow();

    const { error } = await adminClient
      .from('doctor_product_licenses')
      .update({
        status: 'INACTIVE',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', licenseId)
      .eq('hospital_id', hospitalId);

    if (error) {
      throw new BadRequestException(`Failed to revoke license: ${error.message}`);
    }

    this.logger.log(`License ${licenseId} revoked`);
  }

  // =========================================
  // Entitlements (User facing)
  // =========================================

  async getUserEntitlements(userId: string, hospitalId: string): Promise<UserEntitlementsDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get hospital
    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('id, name')
      .eq('id', hospitalId)
      .single();

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    // Use the database function
    const { data: entitlements, error } = await adminClient.rpc('get_user_entitlements', {
      p_hospital_id: hospitalId,
      p_user_id: userId,
    });

    if (error) {
      this.logger.error(`Failed to get entitlements: ${error.message}`);
      throw new BadRequestException('Failed to get entitlements');
    }

    // Get all products for reference
    const { data: products } = await adminClient
      .from('products')
      .select('code, name')
      .eq('is_active', true);

    return {
      hospitalId,
      hospitalName: hospital.name,
      products: (products || []).map((p) => {
        const ent = (entitlements || []).find((e: any) => e.product_code === p.code);
        return {
          code: p.code as ProductCode,
          name: p.name,
          hasAccess: ent?.has_access || false,
          hasLicense: ent?.has_license || false,
        };
      }),
    };
  }

  async canAccessProduct(
    hospitalId: string,
    userId: string,
    productCode: ProductCode,
  ): Promise<boolean> {
    const adminClient = this.getAdminClientOrThrow();

    const { data, error } = await adminClient.rpc('can_access_product', {
      p_hospital_id: hospitalId,
      p_user_id: userId,
      p_product_code: productCode,
    });

    if (error) {
      this.logger.error(`Access check failed: ${error.message}`);
      return false;
    }

    return data === true;
  }

  // =========================================
  // Stats (Super Admin)
  // =========================================

  async getSubscriptionStats(): Promise<SubscriptionStatsDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get all active/trial subscriptions with items
    const { data: subscriptions } = await adminClient
      .from('hospital_subscriptions')
      .select(`
        id, status,
        hospital_subscription_items (
          doctor_limit,
          price_per_doctor,
          discount_amount,
          currency,
          products (code, name)
        )
      `)
      .in('status', ['ACTIVE', 'TRIAL']);

    const stats: SubscriptionStatsDto = {
      totalSubscriptions: subscriptions?.length || 0,
      activeSubscriptions: subscriptions?.filter((s) => s.status === 'ACTIVE').length || 0,
      trialSubscriptions: subscriptions?.filter((s) => s.status === 'TRIAL').length || 0,
      totalMRR: 0,
      currency: 'USD',
      byProduct: [],
    };

    const productStats = new Map<string, { name: string; subs: number; doctors: number; mrr: number }>();

    for (const sub of subscriptions || []) {
      for (const item of (sub as any).hospital_subscription_items || []) {
        const code = (item.products as any)?.code;
        const name = (item.products as any)?.name;
        const monthlyTotal =
          item.doctor_limit * item.price_per_doctor - (item.discount_amount || 0);

        stats.totalMRR += monthlyTotal;

        const existing = productStats.get(code) || { name, subs: 0, doctors: 0, mrr: 0 };
        existing.subs++;
        existing.doctors += item.doctor_limit;
        existing.mrr += monthlyTotal;
        productStats.set(code, existing);
      }
    }

    stats.byProduct = Array.from(productStats.entries()).map(([code, data]) => ({
      productCode: code as ProductCode,
      productName: data.name,
      activeSubscriptions: data.subs,
      totalDoctors: data.doctors,
      mrr: data.mrr,
    }));

    return stats;
  }

  async getLicenseStats(hospitalId: string): Promise<LicenseStatsDto> {
    const adminClient = this.getAdminClientOrThrow();

    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('id, name')
      .eq('id', hospitalId)
      .single();

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const subscription = await this.getHospitalSubscription(hospitalId);
    if (!subscription) {
      return {
        hospitalId,
        hospitalName: hospital.name,
        byProduct: [],
      };
    }

    // Fetch all active license counts in a single query
    const { data: licenses } = await adminClient
      .from('doctor_product_licenses')
      .select('product_code')
      .eq('hospital_id', hospitalId)
      .eq('status', 'ACTIVE');

    const licenseCounts: Record<string, number> = {};
    for (const lic of licenses || []) {
      licenseCounts[lic.product_code] = (licenseCounts[lic.product_code] || 0) + 1;
    }

    const byProduct: LicenseStatsDto['byProduct'] = subscription.items.map((item) => {
      const used = licenseCounts[item.productCode] || 0;
      return {
        productCode: item.productCode,
        productName: item.productName,
        totalLicenses: item.doctorLimit,
        usedLicenses: used,
        availableLicenses: item.doctorLimit - used,
      };
    });

    return {
      hospitalId,
      hospitalName: hospital.name,
      byProduct,
    };
  }

  // =========================================
  // Mappers
  // =========================================

  private mapProduct(p: any): ProductDto {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      features: p.metadata?.features || [],
      isActive: p.is_active,
      sortOrder: 0,
      createdAt: p.created_at,
    };
  }

  private mapPricing(p: any): ProductPricingDto {
    return {
      id: p.id,
      productId: p.product_id,
      region: p.region,
      currency: p.currency,
      pricePerDoctorPerMonth: parseFloat(p.price_per_doctor_monthly),
      isActive: p.is_active,
      effectiveAt: p.effective_at,
    };
  }

  private mapDiscountCode(d: any): DiscountCodeDto {
    const conditions = d.conditions || {};
    return {
      id: d.id,
      code: d.code,
      discountType: d.type,
      discountValue: parseFloat(d.value),
      description: '',
      isActive: d.is_active,
      maxRedemptions: d.max_uses,
      currentRedemptions: d.used_count,
      validFrom: d.created_at,
      validUntil: d.expires_at,
      minDoctors: conditions.minDoctors || null,
      maxDoctors: conditions.maxDoctors || null,
      applicableProducts: d.applicable_product_ids || [],
      applicableRegions: d.region ? [d.region] : [],
      createdAt: d.created_at,
    };
  }

  private mapSubscription(sub: any, items: any[]): HospitalSubscriptionDto {
    const mappedItems = items.map((i) => ({
      id: i.id,
      productCode: (i.products as any)?.code,
      productName: (i.products as any)?.name,
      doctorLimit: i.quantity_doctors,
      pricePerDoctor: parseFloat(i.unit_price),
      currency: sub.currency,
      discountCodeId: sub.discount_code_id,
      discountAmount: 0,
      monthlyTotal: i.quantity_doctors * parseFloat(i.unit_price),
    }));

    return {
      id: sub.id,
      hospitalId: sub.hospital_id,
      hospitalName: (sub.hospitals as any)?.name || '',
      status: sub.status,
      billingCycleStart: sub.started_at,
      billingCycleEnd: sub.renews_at,
      trialEndsAt: sub.trial_ends_at,
      cancelledAt: sub.canceled_at,
      createdAt: sub.created_at,
      items: mappedItems,
      totalMonthly: mappedItems.reduce((sum, i) => sum + i.monthlyTotal, 0),
    };
  }

  private mapLicense(l: any): DoctorLicenseDto {
    return {
      id: l.id,
      doctorId: l.doctor_user_id,
      doctorName: (l.profiles as any)?.full_name || '',
      doctorEmail: (l.profiles as any)?.email || '',
      productCode: (l.products as any)?.code,
      productName: (l.products as any)?.name,
      status: l.status,
      assignedAt: l.assigned_at,
      assignedByName: (l.assigner as any)?.full_name || '',
      expiresAt: null,
      revokedAt: l.revoked_at,
    };
  }
}

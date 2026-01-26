import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseGuard } from '../supabase/supabase.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('v1/specializations')
@UseGuards(SupabaseGuard)
export class SpecializationsController {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all active specializations for dropdown selection
   * GET /v1/specializations
   */
  @Get()
  async getActiveSpecializations() {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      return [];
    }

    const { data, error } = await adminClient
      .from('specializations')
      .select('id, name, description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[SpecializationsController] Error fetching specializations:', error);
      return [];
    }

    return data || [];
  }
}

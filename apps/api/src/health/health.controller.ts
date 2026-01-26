import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma.service';

@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  @Get('health')
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch (e) {
      return { status: 'not_ready', database: 'disconnected' };
    }
  }

  @Get('debug/profiles')
  async debugProfiles(@Query('email') email?: string) {
    // This endpoint helps debug profile issues
    // Uses service role key to bypass RLS
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return {
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
        hint: 'Add SUPABASE_SERVICE_ROLE_KEY to your .env file (from Supabase Dashboard > Settings > API > service_role key)',
      };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get all profiles
    let query = adminClient.from('profiles').select('user_id, email, full_name, is_super_admin, created_at');
    if (email) {
      query = query.eq('email', email);
    }

    const { data: profiles, error: profilesError } = await query;

    // Get all auth users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();

    return {
      profiles: profilesError ? { error: profilesError.message } : profiles,
      authUsers: authError ? { error: authError.message } : authUsers?.users?.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      })),
      hint: email
        ? `Showing profile for email: ${email}`
        : 'Add ?email=your@email.com to filter by email',
    };
  }

  @Get('debug/invites')
  async debugInvites(@Query('email') email?: string) {
    // This endpoint helps debug invite issues
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let query = adminClient
      .from('hospital_invites')
      .select(`
        id,
        invited_email,
        role,
        status,
        expires_at,
        created_at,
        hospital:hospitals (id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (email) {
      query = query.eq('invited_email', email.toLowerCase());
    }

    const { data: invites, error } = await query;

    return {
      invites: error ? { error: error.message } : invites,
      hint: email
        ? `Showing invites for email: ${email}`
        : 'Add ?email=invited@email.com to filter. Showing latest 20 invites.',
    };
  }

  @Get('debug/hospitals')
  async debugHospitals() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: hospitals, error } = await adminClient
      .from('hospitals')
      .select('id, name, city, state, country, status, created_at')
      .order('created_at', { ascending: false });

    return {
      hospitals: error ? { error: error.message } : hospitals,
      count: hospitals?.length || 0,
    };
  }

  @Get('debug/memberships')
  async debugMemberships(@Query('email') email?: string) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let query = adminClient
      .from('hospital_memberships')
      .select(`
        id,
        user_id,
        hospital_id,
        role,
        status,
        is_primary,
        created_at,
        hospital:hospitals (name),
        profile:profiles!hospital_memberships_user_id_fkey (email)
      `)
      .order('created_at', { ascending: false });

    const { data: memberships, error } = await query;

    // Filter by email if provided
    let filtered = memberships;
    if (email && memberships) {
      filtered = memberships.filter((m: any) =>
        m.profile?.email?.toLowerCase() === email.toLowerCase()
      );
    }

    return {
      memberships: error ? { error: error.message } : filtered,
      count: filtered?.length || 0,
      hint: email
        ? `Showing memberships for email: ${email}`
        : 'Add ?email=user@email.com to filter',
    };
  }

  /**
   * Debug endpoint to test /v1/me response for a user
   */
  @Get('debug/test-me')
  async debugTestMe(@Query('email') email?: string) {
    if (!email) {
      return { error: 'Email required. Usage: /debug/test-me?email=user@email.com' };
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get profile
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (profileError) {
      return { error: 'Profile not found', details: profileError.message };
    }

    const isSuperAdmin = profile?.is_super_admin || false;
    let hospitals: any[] = [];

    if (isSuperAdmin) {
      // Super admins see ALL hospitals
      const { data: allHospitals, error: hospError } = await adminClient
        .from('hospitals')
        .select('id, name, city, state, country, region, currency, timezone, status')
        .eq('status', 'ACTIVE')
        .order('name');

      if (hospError) {
        return { error: 'Failed to fetch hospitals', details: hospError.message };
      }

      hospitals = (allHospitals || []).map((h: any) => ({
        id: h.id,
        name: h.name,
        city: h.city,
        state: h.state,
        country: h.country,
        region: h.region,
        currency: h.currency,
        timezone: h.timezone,
        role: 'SUPER_ADMIN',
        isPrimary: false,
      }));
    }

    return {
      user: {
        id: profile.user_id,
        email: profile.email,
        fullName: profile.full_name,
        isSuperAdmin,
      },
      hospitals,
      hospitalsCount: hospitals.length,
    };
  }

  /**
   * Clear all test data - USE WITH CAUTION
   * Clears: invites, memberships, profiles (except super admin), and auth users
   */
  @Get('debug/clear-all')
  async debugClearAll(@Query('confirm') confirm?: string) {
    if (confirm !== 'yes') {
      return {
        warning: 'This will delete all test data!',
        usage: '/debug/clear-all?confirm=yes',
        willDelete: ['hospital_invites', 'hospital_memberships', 'profiles (non-super-admin)', 'auth users (non-super-admin)'],
      };
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: any = {};

    // 1. Delete all invites
    const { error: invitesError } = await adminClient
      .from('hospital_invites')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    results.invites = invitesError ? { error: invitesError.message } : 'cleared';

    // 2. Delete all memberships
    const { error: membershipsError } = await adminClient
      .from('hospital_memberships')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    results.memberships = membershipsError ? { error: membershipsError.message } : 'cleared';

    // 3. Get super admin user IDs to preserve
    const { data: superAdmins } = await adminClient
      .from('profiles')
      .select('user_id, email')
      .eq('is_super_admin', true);

    const superAdminIds = (superAdmins || []).map(p => p.user_id);
    results.preservedSuperAdmins = superAdmins?.map(p => p.email) || [];

    // 4. Delete non-super-admin profiles
    if (superAdminIds.length > 0) {
      const { error: profilesError } = await adminClient
        .from('profiles')
        .delete()
        .not('user_id', 'in', `(${superAdminIds.join(',')})`);
      results.profiles = profilesError ? { error: profilesError.message } : 'cleared (kept super admins)';
    } else {
      results.profiles = 'no super admins found, skipped to be safe';
    }

    // 5. Delete non-super-admin auth users
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    let deletedUsers = 0;
    for (const user of authUsers?.users || []) {
      if (!superAdminIds.includes(user.id)) {
        await adminClient.auth.admin.deleteUser(user.id);
        deletedUsers++;
      }
    }
    results.authUsers = `deleted ${deletedUsers} users (kept super admins)`;

    return {
      success: true,
      results,
      message: 'Test data cleared. Super admin accounts preserved.',
    };
  }

  /**
   * Get invite URL for testing (since emails may be in console mode)
   */
  @Get('debug/invite-url')
  async debugInviteUrl(@Query('email') email?: string) {
    if (!email) {
      return { error: 'Email required. Usage: /debug/invite-url?email=invited@email.com' };
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find pending invite
    const { data: invite, error } = await adminClient
      .from('hospital_invites')
      .select('id, invited_email, role, status, token_hash, hospital:hospitals (name)')
      .eq('invited_email', email.toLowerCase())
      .eq('status', 'PENDING')
      .single();

    if (error || !invite) {
      return { error: 'No pending invite found for this email', details: error?.message };
    }

    // Generate a new token and update the invite (since we can't recover the original)
    const crypto = require('crypto');
    const newToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');

    await adminClient
      .from('hospital_invites')
      .update({ token_hash: newTokenHash })
      .eq('id', invite.id);

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const inviteUrl = `${appUrl}/invite/accept?token=${newToken}`;

    return {
      email: invite.invited_email,
      role: invite.role,
      hospital: (invite.hospital as any)?.name,
      inviteUrl,
      hint: 'Open this URL to accept the invite (or share with invited user)',
    };
  }

  /**
   * Manually accept a pending invite for a user
   * Used to fix stuck invites
   */
  @Get('debug/accept-invite')
  async debugAcceptInvite(@Query('email') email?: string) {
    if (!email) {
      return { error: 'Email is required. Usage: /debug/accept-invite?email=user@email.com' };
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceRoleKey) {
      return { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
    }

    const adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find pending invite for this email
    const { data: invite, error: inviteError } = await adminClient
      .from('hospital_invites')
      .select('id, invited_email, role, status, hospital_id, hospital:hospitals (name)')
      .eq('invited_email', email.toLowerCase())
      .eq('status', 'PENDING')
      .single();

    if (inviteError || !invite) {
      return {
        error: 'No pending invite found for this email',
        details: inviteError?.message,
      };
    }

    // Find user profile for this email
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('user_id, email, full_name')
      .eq('email', email.toLowerCase())
      .single();

    if (profileError || !profile) {
      return {
        error: 'No user profile found for this email',
        details: profileError?.message,
        hint: 'User must sign up first before accepting invite',
      };
    }

    // Call accept_invite RPC
    const { data: result, error: acceptError } = await adminClient.rpc('accept_invite', {
      p_invite_id: invite.id,
      p_user_id: profile.user_id,
      p_user_email: profile.email,
    });

    if (acceptError) {
      return {
        error: 'Failed to accept invite',
        details: acceptError.message,
      };
    }

    return {
      success: true,
      result,
      invite: {
        id: invite.id,
        email: invite.invited_email,
        role: invite.role,
        hospital: (invite.hospital as any)?.name,
      },
      user: {
        id: profile.user_id,
        email: profile.email,
        name: profile.full_name,
      },
    };
  }
}

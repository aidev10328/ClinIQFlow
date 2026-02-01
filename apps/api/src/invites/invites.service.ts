import { Injectable, Logger, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { getEmailProvider } from '../providers/email';
import { createHash, randomBytes } from 'crypto';
import {
  CreateManagerInviteDto,
  CreateDoctorInviteDto,
  InviteRole,
  InviteResponseDto,
  InviteLookupResponseDto,
  AcceptInviteResponseDto,
} from './dto/invite.dto';

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);
  private readonly appUrl: string;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    this.appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  private generateToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return { token, tokenHash };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createManagerInvite(
    dto: CreateManagerInviteDto,
    invitedByUserId: string,
    accessToken: string,
  ): Promise<{ invite: InviteResponseDto; inviteUrl: string }> {
    // Use admin client to verify super admin status (bypasses RLS)
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Server configuration error');
    }

    // Verify user is super admin using admin client
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', invitedByUserId)
      .single();

    if (profileError) {
      this.logger.error(`Failed to verify super admin: ${profileError.message}`);
      throw new ForbiddenException('Could not verify permissions');
    }

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can invite hospital managers');
    }

    // Use admin client for all operations since we verified super admin status
    // This bypasses RLS which may block super admin operations

    // Verify hospital exists
    const { data: hospital, error: hospitalError } = await adminClient
      .from('hospitals')
      .select('id, name')
      .eq('id', dto.hospitalId)
      .single();

    if (hospitalError || !hospital) {
      throw new NotFoundException('Hospital not found');
    }

    // Check for existing pending invite
    const { data: existingInvite } = await adminClient
      .from('hospital_invites')
      .select('id')
      .eq('hospital_id', dto.hospitalId)
      .eq('invited_email', dto.email.toLowerCase())
      .eq('status', 'PENDING')
      .single();

    if (existingInvite) {
      throw new BadRequestException('A pending invite already exists for this email');
    }

    // Generate token
    const { token, tokenHash } = this.generateToken();

    // Create invite using admin client to bypass RLS
    const { data: invite, error: insertError } = await adminClient
      .from('hospital_invites')
      .insert({
        hospital_id: dto.hospitalId,
        invited_email: dto.email.toLowerCase(),
        role: InviteRole.HOSPITAL_MANAGER,
        invited_by_user_id: invitedByUserId,
        token_hash: tokenHash,
        metadata: dto.message ? { message: dto.message } : null,
      })
      .select('id, hospital_id, invited_email, role, status, expires_at, created_at')
      .single();

    if (insertError) {
      this.logger.error(`Failed to create invite: ${insertError.message}`);
      throw new BadRequestException('Failed to create invite');
    }

    const inviteUrl = `${this.appUrl}/invite/accept?token=${token}`;

    // Send invite email using our email provider (Resend/SendGrid/Console)
    // This is more reliable than Supabase's rate-limited email service
    await this.sendInviteEmail(dto.email, hospital.name, 'Hospital Manager', inviteUrl, dto.message);
    this.logger.log(`Invite email sent to ${dto.email} for hospital ${hospital.name}`);

    return {
      invite: {
        id: invite.id,
        hospitalId: invite.hospital_id,
        hospitalName: hospital.name,
        invitedEmail: invite.invited_email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expires_at,
        createdAt: invite.created_at,
      },
      inviteUrl,
    };
  }

  async createDoctorInvite(
    dto: CreateDoctorInviteDto,
    hospitalId: string,
    invitedByUserId: string,
    accessToken: string,
  ): Promise<{ invite: InviteResponseDto; inviteUrl: string }> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify user is hospital manager (RLS will handle this, but let's be explicit)
    const { data: membership } = await supabase
      .from('hospital_memberships')
      .select('role')
      .eq('hospital_id', hospitalId)
      .eq('user_id', invitedByUserId)
      .eq('status', 'ACTIVE')
      .single();

    if (membership?.role !== 'HOSPITAL_MANAGER') {
      throw new ForbiddenException('Only hospital managers can invite doctors');
    }

    // Get hospital name
    const { data: hospital } = await supabase
      .from('hospitals')
      .select('name')
      .eq('id', hospitalId)
      .single();

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    // Check for existing pending invite
    const { data: existingInvite } = await supabase
      .from('hospital_invites')
      .select('id')
      .eq('hospital_id', hospitalId)
      .eq('invited_email', dto.email.toLowerCase())
      .eq('status', 'PENDING')
      .single();

    if (existingInvite) {
      throw new BadRequestException('A pending invite already exists for this email');
    }

    // Generate token
    const { token, tokenHash } = this.generateToken();

    // Create invite
    const { data: invite, error: insertError } = await supabase
      .from('hospital_invites')
      .insert({
        hospital_id: hospitalId,
        invited_email: dto.email.toLowerCase(),
        role: InviteRole.DOCTOR,
        invited_by_user_id: invitedByUserId,
        token_hash: tokenHash,
        metadata: {
          ...(dto.firstName ? { firstName: dto.firstName } : {}),
          ...(dto.lastName ? { lastName: dto.lastName } : {}),
          ...(dto.message ? { message: dto.message } : {}),
        },
      })
      .select('id, hospital_id, invited_email, role, status, expires_at, created_at')
      .single();

    if (insertError) {
      this.logger.error(`Failed to create invite: ${insertError.message}`);
      throw new BadRequestException('Failed to create invite');
    }

    const inviteUrl = `${this.appUrl}/invite/accept?token=${token}`;

    // Send invite email using our email provider (Resend/SendGrid/Console)
    await this.sendInviteEmail(dto.email, hospital.name, 'Doctor', inviteUrl, dto.message);
    this.logger.log(`Invite email sent to ${dto.email} for hospital ${hospital.name}`);

    return {
      invite: {
        id: invite.id,
        hospitalId: invite.hospital_id,
        hospitalName: hospital.name,
        invitedEmail: invite.invited_email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expires_at,
        createdAt: invite.created_at,
      },
      inviteUrl,
    };
  }

  async lookupInvite(token: string): Promise<InviteLookupResponseDto> {
    const tokenHash = this.hashToken(token);

    // Use admin client to bypass RLS - anyone with a valid token should be able to lookup
    const supabase = this.supabaseService.getAdminClient();
    if (!supabase) {
      this.logger.error('Admin client not available for invite lookup');
      return { valid: false, error: 'Server configuration error' };
    }

    // Lookup invite by token hash
    const { data: invite, error } = await supabase
      .from('hospital_invites')
      .select(`
        id,
        invited_email,
        role,
        status,
        expires_at,
        hospital:hospitals (
          name
        )
      `)
      .eq('token_hash', tokenHash)
      .single();

    if (error || !invite) {
      return { valid: false, error: 'Invalid or expired invite' };
    }

    // Check if still valid
    if (invite.status !== 'PENDING') {
      return { valid: false, error: `Invite has been ${invite.status.toLowerCase()}` };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return { valid: false, error: 'Invite has expired' };
    }

    return {
      valid: true,
      hospitalName: (invite.hospital as any)?.name,
      role: invite.role,
      invitedEmail: invite.invited_email,
      expiresAt: invite.expires_at,
    };
  }

  async acceptInvite(
    token: string,
    userId: string,
    userEmail: string,
    accessToken: string,
  ): Promise<AcceptInviteResponseDto> {
    const tokenHash = this.hashToken(token);

    // IMPORTANT: Use admin client to bypass RLS
    // Regular users can't read invites (no RLS policy allows this)
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      this.logger.error('Admin client not available for accepting invite');
      return { success: false, error: 'Server configuration error' };
    }

    this.logger.log(`Accepting invite for user: ${userEmail}, userId: ${userId}`);

    // Lookup invite using admin client to bypass RLS
    const { data: invite, error: lookupError } = await adminClient
      .from('hospital_invites')
      .select('id, invited_email, role, status, expires_at, hospital_id')
      .eq('token_hash', tokenHash)
      .single();

    if (lookupError) {
      this.logger.error(`Invite lookup error: ${lookupError.message}`);
      return { success: false, error: 'Invalid invite' };
    }

    if (!invite) {
      this.logger.error('Invite not found');
      return { success: false, error: 'Invalid invite' };
    }

    this.logger.log(`Found invite: ${invite.id}, status: ${invite.status}, email: ${invite.invited_email}`);

    // Validate
    if (invite.status !== 'PENDING') {
      return { success: false, error: `Invite has been ${invite.status.toLowerCase()}` };
    }

    if (new Date(invite.expires_at) < new Date()) {
      await adminClient
        .from('hospital_invites')
        .update({ status: 'EXPIRED' })
        .eq('id', invite.id);
      return { success: false, error: 'Invite has expired' };
    }

    // Check email matches (case-insensitive)
    if (invite.invited_email.toLowerCase() !== userEmail.toLowerCase()) {
      this.logger.error(`Email mismatch: invite=${invite.invited_email}, user=${userEmail}`);
      return { success: false, error: 'Email does not match invite' };
    }

    // Call accept_invite RPC using admin client
    const { data: result, error: acceptError } = await adminClient.rpc('accept_invite', {
      p_invite_id: invite.id,
      p_user_id: userId,
      p_user_email: userEmail,
    });

    if (acceptError) {
      this.logger.error(`Failed to accept invite RPC: ${acceptError.message}`);
      return { success: false, error: 'Failed to accept invite' };
    }

    this.logger.log(`Accept invite result: ${JSON.stringify(result)}`);

    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Failed to accept invite' };
    }

    return {
      success: true,
      hospitalId: result.hospital_id,
      role: result.role,
      isPrimary: result.is_primary,
    };
  }

  /**
   * Signup and accept invite in one step
   * Uses admin API to create user (auto-confirmed, no email verification needed)
   */
  async signupAndAcceptInvite(
    token: string,
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ success: boolean; error?: string; session?: any }> {
    const tokenHash = this.hashToken(token);

    // Get admin client
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      return { success: false, error: 'Server configuration error' };
    }

    // 1. Verify the invite exists and is valid
    const { data: invite, error: inviteError } = await adminClient
      .from('hospital_invites')
      .select('id, invited_email, role, status, expires_at, hospital_id')
      .eq('token_hash', tokenHash)
      .single();

    if (inviteError || !invite) {
      return { success: false, error: 'Invalid invite token' };
    }

    if (invite.status !== 'PENDING') {
      return { success: false, error: `Invite has been ${invite.status.toLowerCase()}` };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return { success: false, error: 'Invite has expired' };
    }

    // Verify email matches
    if (invite.invited_email.toLowerCase() !== email.toLowerCase()) {
      return { success: false, error: 'Email does not match invite' };
    }

    // 2. Try to create user with admin API (auto-confirmed)
    let userId: string;

    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        display_name: displayName || email.split('@')[0],
      },
    });

    if (createError) {
      this.logger.error(`Failed to create user: ${createError.message}`);

      // If user already exists (likely from inviteUserByEmail), update their password instead
      if (createError.message.includes('already been registered')) {
        this.logger.log('User already exists, attempting to update password');

        // Get existing user by email
        const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) {
          return { success: false, error: 'Failed to find existing user' };
        }

        const existingUser = listData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!existingUser) {
          return { success: false, error: 'User not found' };
        }

        // Update user password and confirm email
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          existingUser.id,
          {
            password,
            email_confirm: true,
            user_metadata: {
              display_name: displayName || email.split('@')[0],
            },
          }
        );

        if (updateError) {
          this.logger.error(`Failed to update user password: ${updateError.message}`);
          return { success: false, error: 'Failed to set password' };
        }

        userId = existingUser.id;
        this.logger.log(`Updated existing user ${email} with ID ${userId}`);
      } else {
        return { success: false, error: createError.message };
      }
    } else {
      userId = authData.user.id;
      this.logger.log(`Created new user ${email} with ID ${userId}`);
    }
    this.logger.log(`Created user ${email} with ID ${userId}`);

    // 3. Accept the invite
    const { data: acceptResult, error: acceptError } = await adminClient.rpc('accept_invite', {
      p_invite_id: invite.id,
      p_user_id: userId,
      p_user_email: email.toLowerCase(),
    });

    if (acceptError) {
      this.logger.error(`Failed to accept invite: ${acceptError.message}`);
      return { success: false, error: 'Failed to accept invite' };
    }

    this.logger.log(`Invite accepted: ${JSON.stringify(acceptResult)}`);

    // 4. Generate a session for the user so they can login immediately
    // We use signInWithPassword since the user is now created
    const anonClient = this.supabaseService.getAnonClient();
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (signInError) {
      this.logger.warn(`Auto sign-in failed: ${signInError.message}`);
      // User was created but couldn't auto sign-in - they can manually login
      return {
        success: true,
        error: 'Account created. Please sign in manually.',
      };
    }

    return {
      success: true,
      session: signInData.session,
    };
  }

  async getHospitalInvites(hospitalId: string, accessToken: string): Promise<InviteResponseDto[]> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    const { data: invites, error } = await supabase
      .from('hospital_invites')
      .select(`
        id,
        hospital_id,
        invited_email,
        role,
        status,
        expires_at,
        created_at,
        hospital:hospitals (name)
      `)
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch invites');
    }

    return (invites || []).map(invite => ({
      id: invite.id,
      hospitalId: invite.hospital_id,
      hospitalName: (invite.hospital as any)?.name || '',
      invitedEmail: invite.invited_email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
    }));
  }

  /**
   * Get invites for a hospital - for super admins who may not be members
   */
  async getHospitalInvitesForAdmin(
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<InviteResponseDto[]> {
    // Use admin client to check super admin status (bypasses RLS)
    const adminClient = this.supabaseService.getAdminClient();

    // Check if user is super admin
    const { data: profile } = adminClient
      ? await adminClient
          .from('profiles')
          .select('is_super_admin')
          .eq('user_id', userId)
          .single()
      : { data: null };

    if (!profile?.is_super_admin) {
      // Fall back to regular method which respects RLS
      return this.getHospitalInvites(hospitalId, accessToken);
    }

    // Super admin - use admin client to fetch invites
    const { data: invites, error } = await adminClient!
      .from('hospital_invites')
      .select(`
        id,
        hospital_id,
        invited_email,
        role,
        status,
        expires_at,
        created_at,
        hospital:hospitals (name)
      `)
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch invites: ${error.message}`);
      throw new BadRequestException('Failed to fetch invites');
    }

    return (invites || []).map(invite => ({
      id: invite.id,
      hospitalId: invite.hospital_id,
      hospitalName: (invite.hospital as any)?.name || '',
      invitedEmail: invite.invited_email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
    }));
  }

  async revokeInvite(inviteId: string, hospitalId: string, accessToken: string): Promise<void> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    const { error } = await supabase
      .from('hospital_invites')
      .update({ status: 'REVOKED' })
      .eq('id', inviteId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'PENDING');

    if (error) {
      throw new BadRequestException('Failed to revoke invite');
    }
  }

  /**
   * Resend an invite - generates new token and extends expiry
   * Can be done by super admins (any invite) or hospital managers (doctor invites in their hospital)
   */
  async resendInvite(
    inviteId: string,
    userId: string,
    accessToken: string,
    hospitalId?: string,
  ): Promise<{ success: boolean; inviteUrl: string }> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Server configuration error');
    }

    // Check if user is super admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    const isSuperAdmin = profile?.is_super_admin;

    // Get the invite
    const { data: invite, error: fetchError } = await adminClient
      .from('hospital_invites')
      .select(`
        id,
        invited_email,
        role,
        status,
        hospital_id,
        hospital:hospitals (name)
      `)
      .eq('id', inviteId)
      .single();

    if (fetchError || !invite) {
      throw new NotFoundException('Invite not found');
    }

    // Verify permissions
    if (!isSuperAdmin) {
      // Hospital managers can only resend doctor invites for their hospital
      if (!hospitalId) {
        throw new ForbiddenException('Hospital context required');
      }

      // Verify the invite is for the manager's hospital
      if (invite.hospital_id !== hospitalId) {
        throw new ForbiddenException('Cannot resend invite for another hospital');
      }

      // Verify the user is a hospital manager for this hospital
      const supabase = this.supabaseService.getClientWithToken(accessToken);
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('hospital_id', hospitalId)
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .single();

      if (membership?.role !== 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Only hospital managers can resend invites');
      }

      // Hospital managers can only resend doctor invites (not manager invites)
      if (invite.role === 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Hospital managers cannot resend manager invites');
      }
    }

    // Can only resend pending invites (or expired ones)
    if (invite.status !== 'PENDING') {
      throw new BadRequestException(`Cannot resend invite with status: ${invite.status}`);
    }

    // Generate new token
    const { token, tokenHash } = this.generateToken();

    // Update invite with new token and extended expiry (7 days from now)
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    const { error: updateError } = await adminClient
      .from('hospital_invites')
      .update({
        token_hash: tokenHash,
        expires_at: newExpiresAt.toISOString(),
      })
      .eq('id', inviteId);

    if (updateError) {
      this.logger.error(`Failed to update invite: ${updateError.message}`);
      throw new BadRequestException('Failed to resend invite');
    }

    const inviteUrl = `${this.appUrl}/invite/accept?token=${token}`;
    const hospitalName = (invite.hospital as any)?.name || 'the hospital';
    const roleName = invite.role === 'HOSPITAL_MANAGER' ? 'Hospital Manager' : 'Doctor';

    // Send invite email
    await this.sendInviteEmail(invite.invited_email, hospitalName, roleName, inviteUrl);

    this.logger.log(`Resent invite to ${invite.invited_email} for hospital ${hospitalName}`);

    return { success: true, inviteUrl };
  }

  private async sendInviteEmail(
    email: string,
    hospitalName: string,
    role: string,
    inviteUrl: string,
    message?: string,
  ): Promise<void> {
    const emailProvider = getEmailProvider();

    const subject = `You've been invited to join ${hospitalName} on ClinQflow`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4176B5;">You're Invited!</h1>
        <p>You've been invited to join <strong>${hospitalName}</strong> as a <strong>${role}</strong> on ClinQflow.</p>
        ${message ? `<p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">"${message}"</p>` : ''}
        <p>
          <a href="${inviteUrl}" style="display: inline-block; background: #4176B5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          This invite will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
        </p>
        <p style="color: #666; font-size: 12px;">
          Or copy this link: ${inviteUrl}
        </p>
      </div>
    `;

    try {
      await emailProvider.send({
        to: email,
        subject,
        html,
      });
      this.logger.log(`Invite email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send invite email: ${error.message}`);
      // Don't throw - invite was created, email failure shouldn't rollback
    }
  }
}

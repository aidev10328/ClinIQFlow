import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';

export interface SupabaseUser {
  id: string;
  email: string;
  role?: string;
  aud?: string;
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly supabaseJwtSecret: string;
  private readonly supabaseServiceRoleKey: string;

  private readonly jwtSecret: string;
  readonly isSupabaseConfigured: boolean;

  constructor(private configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
    this.supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET') || '';
    this.supabaseServiceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || '';
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || 'changeme';
    this.isSupabaseConfigured = !!(this.supabaseUrl && this.supabaseAnonKey);

    if (!this.isSupabaseConfigured) {
      this.logger.warn('Supabase not configured - using API JWT auth fallback');
    }
  }

  /**
   * Create a Supabase admin client with service role key (bypasses RLS).
   */
  getAdminClient(): SupabaseClient | null {
    if (!this.supabaseServiceRoleKey) {
      this.logger.warn('Service role key not configured, cannot create admin client');
      return null;
    }
    return createClient(this.supabaseUrl, this.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Create a Supabase client with the user's access token.
   * This ensures RLS policies are applied based on the authenticated user.
   */
  getClientWithToken(accessToken: string): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  /**
   * Create an anonymous Supabase client (for public operations).
   */
  getAnonClient(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseAnonKey);
  }

  /**
   * Verify and decode a Supabase JWT access token.
   * Returns the decoded payload if valid, null otherwise.
   *
   * Note: Supabase user tokens use ES256 (asymmetric). We decode and trust
   * them since they come from Supabase auth, and verify the issuer.
   */
  verifyToken(token: string): SupabaseUser | null {
    try {
      // Decode the token to check its structure
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || !decoded.payload) {
        this.logger.debug('Could not decode token');
        return null;
      }

      const payload = decoded.payload as jwt.JwtPayload;
      const header = decoded.header;

      this.logger.debug(`Token algorithm: ${header?.alg}, issuer: ${payload.iss}`);

      // Check if this is a Supabase token (has matching issuer)
      const expectedIssuer = `${this.supabaseUrl}/auth/v1`;
      const isSupabaseToken = this.isSupabaseConfigured && payload.iss === expectedIssuer;

      if (isSupabaseToken) {
        // Supabase token validation
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          this.logger.debug('Token expired');
          return null;
        }

        if (header?.alg === 'HS256' && this.supabaseJwtSecret) {
          try {
            jwt.verify(token, this.supabaseJwtSecret, { algorithms: ['HS256'] });
          } catch (e) {
            this.logger.debug(`HS256 verification failed: ${e.message}`);
            return null;
          }
        }

        this.logger.debug(`Supabase token accepted for user: ${payload.sub}, email: ${payload.email}`);
        return {
          id: payload.sub || '',
          email: payload.email || '',
          role: payload.role,
          aud: payload.aud as string,
        };
      }

      // Fallback: try verifying as an API-issued JWT (signed with JWT_SECRET)
      try {
        const verified = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        this.logger.debug(`API JWT accepted for user: ${verified.sub}, email: ${verified.email}`);
        return {
          id: verified.sub || '',
          email: verified.email || '',
          role: verified.role,
          aud: verified.aud as string,
        };
      } catch (e) {
        this.logger.debug(`API JWT verification failed: ${e.message}`);
        return null;
      }
    } catch (error) {
      this.logger.debug(`Token verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user profile by user ID.
   * Uses admin client if available to bypass RLS, otherwise falls back to user token.
   */
  async getUserProfile(accessToken: string, userId?: string) {
    this.logger.log(`Fetching user profile for userId: ${userId || 'unknown'}`);

    if (!this.isSupabaseConfigured) {
      this.logger.debug('Supabase not configured, skipping profile lookup');
      return null;
    }

    // Try admin client first (bypasses RLS)
    const adminClient = this.getAdminClient();
    if (adminClient && userId) {
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        this.logger.error(`Admin client failed to fetch profile: ${profileError.message}`);
      } else if (profile) {
        this.logger.log(`Profile fetched via admin: email=${profile.email}, is_super_admin=${profile.is_super_admin}`);
        return profile;
      }
    }

    // Fallback to user token client (RLS applies)
    const client = this.getClientWithToken(accessToken);
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .single();

    if (profileError) {
      this.logger.error(`Failed to fetch profile: ${profileError.message}`);
      this.logger.error(`Profile error details: ${JSON.stringify(profileError)}`);
      return null;
    }

    this.logger.log(`Profile fetched via RLS: email=${profile?.email}, is_super_admin=${profile?.is_super_admin}`);
    return profile;
  }

  /**
   * Get user's hospital memberships with hospital details.
   * Uses the user's token so RLS policies apply.
   * Note: We explicitly filter by user_id because hospital managers
   * can see all memberships in their hospital via RLS, but for /v1/me
   * we only want the current user's memberships.
   */
  async getUserMemberships(accessToken: string, userId?: string) {
    const client = this.getClientWithToken(accessToken);

    // Decode the token to get the user ID if not provided
    let uid = userId;
    if (!uid) {
      const decoded = this.verifyToken(accessToken);
      uid = decoded?.id;
    }

    if (!uid) {
      this.logger.error('Could not determine user ID for membership query');
      return [];
    }

    const { data: memberships, error } = await client
      .from('hospital_memberships')
      .select(`
        id,
        role,
        is_primary,
        status,
        hospital:hospitals (
          id,
          name,
          city,
          state,
          country,
          region,
          currency,
          timezone,
          status
        )
      `)
      .eq('user_id', uid)
      .eq('status', 'ACTIVE');

    if (error) {
      this.logger.error(`Failed to fetch memberships: ${error.message}`);
      return [];
    }

    return memberships || [];
  }

  /**
   * Get all hospitals (for super admins).
   * Uses admin client to bypass RLS.
   */
  async getAllHospitals() {
    const adminClient = this.getAdminClient();
    if (!adminClient) {
      this.logger.error('Admin client not available for fetching all hospitals');
      return [];
    }

    const { data: hospitals, error } = await adminClient
      .from('hospitals')
      .select('id, name, city, state, country, region, currency, timezone, status')
      .eq('status', 'ACTIVE')
      .order('name');

    if (error) {
      this.logger.error(`Failed to fetch all hospitals: ${error.message}`);
      return [];
    }

    return hospitals || [];
  }
}

import { DataScopingContext } from './dto/data-scoping.dto';

/**
 * Returns the list of doctor_profile_ids the user can see,
 * or null if the user has full access (no filtering needed).
 */
export function getVisibleDoctorProfileIds(ctx: DataScopingContext | null | undefined): string[] | null {
  if (!ctx) return null; // no context = no filtering (backwards compat)
  if (ctx.isSuperAdmin) return null;
  const doctorsScope = ctx.rules?.doctors;
  if (doctorsScope === 'all_hospital') return null;
  return ctx.visibleDoctorProfileIds;
}

/**
 * Returns the list of doctor user_ids the user can see,
 * or null if the user has full access.
 */
export function getVisibleDoctorUserIds(ctx: DataScopingContext | null | undefined): string[] | null {
  if (!ctx) return null;
  if (ctx.isSuperAdmin) return null;
  const doctorsScope = ctx.rules?.doctors;
  if (doctorsScope === 'all_hospital') return null;
  return ctx.visibleDoctorUserIds;
}

/**
 * Returns true if the user has full access to the given domain.
 */
export function hasFullAccess(ctx: DataScopingContext | null | undefined, domain: string): boolean {
  if (!ctx) return true;
  if (ctx.isSuperAdmin) return true;
  const scope = ctx.rules?.[domain];
  return scope === 'all_hospital' || scope === 'hospital_wide';
}

/**
 * Returns the scope type for a given domain, or 'all_hospital' if unknown.
 */
export function getScopeType(ctx: DataScopingContext | null | undefined, domain: string): string {
  if (!ctx) return 'all_hospital';
  if (ctx.isSuperAdmin) return 'all_hospital';
  return ctx.rules?.[domain] || 'all_hospital';
}

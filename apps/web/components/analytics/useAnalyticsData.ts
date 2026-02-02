'use client';

import { useMemo } from 'react';
import { useApiQuery } from '../../lib/hooks/useApiQuery';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';
import { bKey } from './chartHelpers';

export interface DoctorInfo {
  userId: string;
  doctorProfileId: string;
  name: string;
  specialty: string;
}

export interface AnalyticsData {
  appointments: any[];
  patients: any[];
  queueStats: { date: string; walkIns: number; scheduled: number }[];
  members: any[];
  doctorList: DoctorInfo[];
  hospitalNow: Date;
  timezone: string;
  isLoading: boolean;
}

export function useAnalyticsData(): AnalyticsData {
  const { getCurrentTime, timezone } = useHospitalTimezone();
  const hospitalNow = useMemo(() => getCurrentTime(), []);

  const apptStart = useMemo(() => { const d = new Date(hospitalNow); d.setFullYear(d.getFullYear() - 1); return bKey(d); }, [hospitalNow]);
  const apptEnd = useMemo(() => { const d = new Date(hospitalNow); d.setMonth(d.getMonth() + 3); return bKey(d); }, [hospitalNow]);

  const { data: members = [], isLoading: ml } = useApiQuery<any[]>(
    ['hospital', 'members', 'compliance'], '/v1/hospitals/members/compliance'
  );
  const { data: patients = [], isLoading: pl } = useApiQuery<any[]>(
    ['hospital', 'patients'], '/v1/patients'
  );
  const { data: appointments = [], isLoading: al } = useApiQuery<any[]>(
    ['hospital', 'appointments', 'all', apptStart, apptEnd],
    `/v1/appointments?startDate=${apptStart}&endDate=${apptEnd}`
  );
  const { data: queueStats = [], isLoading: ql } = useApiQuery<{ date: string; walkIns: number; scheduled: number }[]>(
    ['hospital', 'queue-stats', apptStart, apptEnd, ''],
    `/v1/queue/stats?startDate=${apptStart}&endDate=${apptEnd}`
  );

  const { data: scopingContext } = useApiQuery<{
    role: string; isSuperAdmin: boolean;
    visibleDoctorUserIds: string[]; visibleDoctorProfileIds: string[];
    rules: Record<string, string>;
  }>(['hospital', 'scoping-context'], '/v1/data-scoping/my-context');

  const hasFullDoctorAccess = !scopingContext || scopingContext.isSuperAdmin || scopingContext.rules?.doctors === 'all_hospital';

  const doctorList = useMemo(() => {
    const allDocs = members.filter((m: any) => m.role === 'DOCTOR').map((d: any) => ({
      userId: d.userId,
      doctorProfileId: d.doctorProfileId || d.userId,
      name: d.fullName || d.email || 'Unknown',
      specialty: d.specialty || '',
    }));
    if (hasFullDoctorAccess || !scopingContext?.visibleDoctorUserIds?.length) return allDocs;
    return allDocs.filter((d: any) =>
      scopingContext.visibleDoctorUserIds.includes(d.userId) ||
      scopingContext.visibleDoctorProfileIds?.includes(d.doctorProfileId)
    );
  }, [members, scopingContext, hasFullDoctorAccess]);

  return {
    appointments,
    patients,
    queueStats,
    members,
    doctorList,
    hospitalNow,
    timezone,
    isLoading: ml || pl || al || ql,
  };
}

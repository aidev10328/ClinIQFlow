/**
 * Permission Registry — Single Source of Truth
 *
 * Every controllable UI element (page, section, card, chart, filter, action, metric)
 * is cataloged here. When a new feature, filter, or component is added to the app,
 * add an entry here. The admin RBAC page reads this registry to display the full
 * permission tree, and the sync endpoint keeps the database in sync.
 *
 * Element types:
 *   page     — top-level route / page
 *   section  — grouping of related elements within a page
 *   card     — KPI card, info card, stats card
 *   chart    — any recharts / visualization
 *   filter   — dropdown, search, pill filter
 *   action   — button that triggers a mutation (invite, add, edit, delete, etc.)
 *   metric   — individual stat / number display
 *   table    — data table / list view
 *   modal    — dialog / modal form
 *   tab      — tab navigation item
 */

export type ElementType =
  | 'page'
  | 'section'
  | 'card'
  | 'chart'
  | 'filter'
  | 'action'
  | 'metric'
  | 'table'
  | 'modal'
  | 'tab';

export interface RegistryNode {
  name: string;
  type: ElementType;
  description?: string;
  /** Actions that make sense for this element. Defaults to ['view'] if omitted. */
  actions?: ('view' | 'add' | 'edit' | 'delete')[];
  children?: Record<string, RegistryNode>;
}

// ---------------------------------------------------------------------------
// HOSPITAL MODULE
// ---------------------------------------------------------------------------

const hospitalDashboard: RegistryNode = {
  name: 'Hospital Dashboard',
  type: 'page',
  description: 'Main hospital overview with KPIs, charts, and doctor schedule',
  actions: ['view'],
  children: {
    'hospital.dashboard.kpi': {
      name: 'KPI Cards',
      type: 'section',
      children: {
        'hospital.dashboard.kpi.doctors': { name: 'Doctors Card', type: 'card', description: 'Active doctors count + pending' },
        'hospital.dashboard.kpi.patients': { name: 'Patients Card', type: 'card', description: 'Total patients + today new' },
        'hospital.dashboard.kpi.staff': { name: 'Staff Card', type: 'card', description: 'Active staff count' },
        'hospital.dashboard.kpi.appointments': { name: 'Appointments Card', type: 'card', description: 'Today appointment count' },
        'hospital.dashboard.kpi.licenses': { name: 'Licenses Card', type: 'card', description: 'Used/total licenses' },
        'hospital.dashboard.kpi.invites': { name: 'Invites Card', type: 'card', description: 'Pending invite count' },
      },
    },
    'hospital.dashboard.charts': {
      name: 'Charts',
      type: 'section',
      children: {
        'hospital.dashboard.charts.licensesDonut': {
          name: 'License Usage Donut',
          type: 'chart',
          description: 'Donut chart showing license usage by product',
        },
        'hospital.dashboard.charts.patientsDonut': {
          name: 'Patients Donut',
          type: 'chart',
          description: 'New vs returning patients donut',
          children: {
            'hospital.dashboard.charts.patientsDonut.timeFilter': { name: 'Time Filter', type: 'filter', description: 'Day/Week/Month/Year pills' },
          },
        },
        'hospital.dashboard.charts.appointmentsTrend': {
          name: 'Appointments Trend',
          type: 'chart',
          description: 'Area chart of scheduled vs walk-in appointments',
          children: {
            'hospital.dashboard.charts.appointmentsTrend.doctorFilter': { name: 'Doctor Filter', type: 'filter', description: 'Filter by doctor dropdown' },
            'hospital.dashboard.charts.appointmentsTrend.timeFilter': { name: 'Time Filter', type: 'filter', description: 'Day/Week/Month/Year pills' },
          },
        },
        'hospital.dashboard.charts.patientsTrend': {
          name: 'Patients Trend',
          type: 'chart',
          description: 'Line chart of new vs returning patients over time',
          children: {
            'hospital.dashboard.charts.patientsTrend.doctorFilter': { name: 'Doctor Filter', type: 'filter', description: 'Filter by doctor dropdown' },
            'hospital.dashboard.charts.patientsTrend.timeFilter': { name: 'Time Filter', type: 'filter', description: 'Day/Week/Month/Year pills' },
          },
        },
      },
    },
    'hospital.dashboard.schedule': {
      name: 'Doctor Schedule',
      type: 'section',
      description: 'Doctor schedule card with weekly shifts, time off, and metrics',
      children: {
        'hospital.dashboard.schedule.doctorSelect': { name: 'Doctor Selector', type: 'filter', description: 'Doctor dropdown picker' },
        'hospital.dashboard.schedule.statusBadge': { name: 'Online/Offline Status', type: 'metric', description: 'Doctor check-in status badge' },
        'hospital.dashboard.schedule.weeklyShifts': { name: 'Weekly Shifts Table', type: 'table', description: 'AM/PM/NT shifts for each day' },
        'hospital.dashboard.schedule.timeOff': {
          name: 'Time Off',
          type: 'card',
          description: 'Upcoming leave entries + calendar view',
        },
        'hospital.dashboard.schedule.doctorMetrics': {
          name: 'Doctor Metrics',
          type: 'card',
          description: '2x2 grid: Work Days, Upcoming Leaves, Licenses, Patients Seen',
        },
      },
    },
    'hospital.dashboard.quickActions': {
      name: 'Quick Actions',
      type: 'section',
      children: {
        'hospital.dashboard.quickActions.inviteDoctor': { name: 'Invite Doctor', type: 'action', actions: ['view', 'add'] },
        'hospital.dashboard.quickActions.addPatient': { name: 'Add Patient', type: 'action', actions: ['view', 'add'] },
        'hospital.dashboard.quickActions.manageStaff': { name: 'Manage Staff', type: 'action', actions: ['view'] },
        'hospital.dashboard.quickActions.manageLicenses': { name: 'Manage Licenses', type: 'action', actions: ['view'] },
      },
    },
  },
};

const hospitalDoctors: RegistryNode = {
  name: 'Doctors Management',
  type: 'page',
  description: 'Doctors list and management',
  actions: ['view', 'add', 'edit', 'delete'],
  children: {
    'hospital.doctors.inviteButton': { name: 'Invite Doctor Button', type: 'action', actions: ['view', 'add'] },
    'hospital.doctors.list': { name: 'Doctors List', type: 'table', description: 'Table of all doctors' },
    'hospital.doctors.search': { name: 'Doctor Search', type: 'filter' },
  },
};

const hospitalDoctorDetail: RegistryNode = {
  name: 'Doctor Detail',
  type: 'page',
  description: 'Individual doctor profile, schedule, and compliance',
  actions: ['view', 'edit'],
  children: {
    'hospital.doctors.detail.header': {
      name: 'Doctor Header',
      type: 'section',
      description: 'Avatar, name, status, metadata badges',
      children: {
        'hospital.doctors.detail.header.assignLicense': { name: 'Assign License Button', type: 'action', actions: ['view', 'add'] },
      },
    },
    'hospital.doctors.detail.overview': {
      name: 'Overview Tab',
      type: 'tab',
      children: {
        'hospital.doctors.detail.overview.personalInfo': {
          name: 'Personal Information',
          type: 'card',
          actions: ['view', 'edit'],
          description: 'Name, phone, national ID, DOB, gender, address, emergency contact',
        },
        'hospital.doctors.detail.overview.professionalDetails': {
          name: 'Professional Details',
          type: 'card',
          actions: ['view', 'edit'],
          description: 'Specialization, department, employment type, qualification, fees',
        },
      },
    },
    'hospital.doctors.detail.schedule': {
      name: 'Schedule Tab',
      type: 'tab',
      actions: ['view', 'edit'],
      children: {
        'hospital.doctors.detail.schedule.weeklyGrid': {
          name: 'Weekly Schedule Grid',
          type: 'card',
          actions: ['view', 'edit'],
          description: '7-day shift checkboxes + appointment duration',
        },
        'hospital.doctors.detail.schedule.timeOff': {
          name: 'Time Off Management',
          type: 'card',
          actions: ['view', 'add', 'delete'],
          description: 'Calendar + leave list + add leave modal',
        },
        'hospital.doctors.detail.schedule.shiftTimings': {
          name: 'Shift Timings',
          type: 'modal',
          actions: ['view', 'edit'],
          description: 'Edit AM/PM/NT shift start and end times',
        },
      },
    },
  },
};

const hospitalPatients: RegistryNode = {
  name: 'Patients Management',
  type: 'page',
  description: 'Patient list with split-view details',
  actions: ['view', 'add', 'edit', 'delete'],
  children: {
    'hospital.patients.stats': {
      name: 'Stats Badges',
      type: 'section',
      description: 'Total patients, appointments, reports counts',
    },
    'hospital.patients.addButton': { name: 'Add Patient Button', type: 'action', actions: ['view', 'add'] },
    'hospital.patients.search': { name: 'Patient Search', type: 'filter' },
    'hospital.patients.list': { name: 'Patients Table', type: 'table', description: 'Name, phone, email, age, gender, appts, reports' },
    'hospital.patients.details': {
      name: 'Patient Details Panel',
      type: 'section',
      children: {
        'hospital.patients.details.appointments': {
          name: 'Appointments View',
          type: 'card',
          actions: ['view', 'add', 'edit'],
          description: 'Appointment cards with reschedule/cancel actions',
        },
        'hospital.patients.details.reports': {
          name: 'Reports View',
          type: 'card',
          actions: ['view', 'add'],
          description: 'Medical report cards with generate action',
        },
      },
    },
    'hospital.patients.modal': {
      name: 'Add/Edit Patient Modal',
      type: 'modal',
      actions: ['view', 'add', 'edit'],
    },
  },
};

const hospitalStaff: RegistryNode = {
  name: 'Staff Management',
  type: 'page',
  description: 'Staff accounts management',
  actions: ['view', 'add', 'edit', 'delete'],
  children: {
    'hospital.staff.inviteButton': { name: 'Invite Staff Button', type: 'action', actions: ['view', 'add'] },
    'hospital.staff.list': { name: 'Staff List', type: 'table' },
  },
};

const hospitalAppointments: RegistryNode = {
  name: 'Appointments',
  type: 'page',
  description: 'Appointment scheduling and management',
  actions: ['view', 'add', 'edit', 'delete'],
  children: {
    'hospital.appointments.schedule': { name: 'Schedule Tab', type: 'tab', actions: ['view'] },
    'hospital.appointments.scheduler': {
      name: 'Scheduler Tab',
      type: 'tab',
      actions: ['view', 'add'],
      children: {
        'hospital.appointments.scheduler.doctorSelect': { name: 'Doctor Selector', type: 'filter' },
        'hospital.appointments.scheduler.calendar': { name: 'Calendar View', type: 'card' },
        'hospital.appointments.scheduler.slotGeneration': { name: 'Slot Generation', type: 'action', actions: ['view', 'add'] },
        'hospital.appointments.scheduler.booking': { name: 'Booking Modal', type: 'modal', actions: ['view', 'add'] },
      },
    },
    'hospital.appointments.calendar': { name: 'Calendar Tab', type: 'tab', actions: ['view'] },
    'hospital.appointments.queue': { name: 'Queue Tab', type: 'tab', actions: ['view', 'edit'] },
    'hospital.appointments.patients': { name: 'Patients Tab', type: 'tab', actions: ['view'] },
  },
};

const hospitalBilling: RegistryNode = {
  name: 'Billing & Licenses',
  type: 'page',
  description: 'Subscription, license management, and billing',
  actions: ['view'],
  children: {
    'hospital.billing.subscription': {
      name: 'Subscription Card',
      type: 'card',
      description: 'Status, products, pricing, billing cycle',
    },
    'hospital.billing.licenseStats': {
      name: 'License Usage',
      type: 'card',
      description: 'Product license usage with progress bars',
      children: {
        'hospital.billing.licenseStats.assignButton': { name: 'Assign License Button', type: 'action', actions: ['view', 'add'] },
      },
    },
    'hospital.billing.activeLicenses': {
      name: 'Active Licenses Table',
      type: 'table',
      actions: ['view', 'delete'],
      description: 'Doctor, product, assigned date, status, revoke action',
    },
  },
};

const hospitalSettings: RegistryNode = {
  name: 'Hospital Settings',
  type: 'page',
  description: 'Hospital configuration and settings',
  actions: ['view', 'edit'],
  children: {
    'hospital.settings.basicInfo': {
      name: 'Basic Information',
      type: 'section',
      actions: ['view', 'edit'],
      description: 'Hospital name, address, contact',
    },
    'hospital.settings.billingInfo': {
      name: 'Billing Information',
      type: 'section',
      actions: ['view', 'edit'],
    },
    'hospital.settings.regionalSettings': {
      name: 'Regional Settings',
      type: 'section',
      actions: ['view', 'edit'],
      description: 'Timezone, currency, locale',
    },
  },
};

const hospitalAnalytics: RegistryNode = {
  name: 'Analytics',
  type: 'page',
  description: 'Analytics and reporting (coming soon)',
  actions: ['view'],
};

const hospitalMedicalReports: RegistryNode = {
  name: 'Medical Reports',
  type: 'page',
  description: 'Medical reports management (coming soon)',
  actions: ['view'],
};

// ---------------------------------------------------------------------------
// ADMIN MODULE
// ---------------------------------------------------------------------------

const adminDashboard: RegistryNode = {
  name: 'Admin Dashboard',
  type: 'page',
  description: 'Super admin overview with KPIs and charts',
  actions: ['view'],
  children: {
    'admin.dashboard.kpi': {
      name: 'KPI Cards',
      type: 'section',
      children: {
        'admin.dashboard.kpi.hospitals': { name: 'Hospitals Card', type: 'card' },
        'admin.dashboard.kpi.revenue': { name: 'Revenue Card', type: 'card' },
        'admin.dashboard.kpi.active': { name: 'Active Subscriptions Card', type: 'card' },
        'admin.dashboard.kpi.trials': { name: 'Trials Card', type: 'card' },
        'admin.dashboard.kpi.pastDue': { name: 'Past Due Card', type: 'card' },
        'admin.dashboard.kpi.new': { name: 'New This Month Card', type: 'card' },
      },
    },
    'admin.dashboard.charts': {
      name: 'Charts',
      type: 'section',
      children: {
        'admin.dashboard.charts.subscriptionsDonut': { name: 'Subscriptions Status Donut', type: 'chart' },
        'admin.dashboard.charts.regionsDonut': { name: 'Regions Distribution Donut', type: 'chart' },
        'admin.dashboard.charts.revenueDonut': { name: 'Revenue Breakdown Donut', type: 'chart' },
        'admin.dashboard.charts.hospitalGrowth': {
          name: 'Hospital Growth Chart',
          type: 'chart',
          children: {
            'admin.dashboard.charts.hospitalGrowth.regionFilter': { name: 'Region Filter', type: 'filter' },
            'admin.dashboard.charts.hospitalGrowth.timeFilter': { name: 'Time Filter', type: 'filter' },
          },
        },
        'admin.dashboard.charts.revenueTrend': {
          name: 'Revenue Trend Chart',
          type: 'chart',
          children: {
            'admin.dashboard.charts.revenueTrend.regionFilter': { name: 'Region Filter', type: 'filter' },
            'admin.dashboard.charts.revenueTrend.timeFilter': { name: 'Time Filter', type: 'filter' },
          },
        },
      },
    },
    'admin.dashboard.trialsExpiring': { name: 'Trials Expiring Alert', type: 'card' },
  },
};

const adminHospitals: RegistryNode = {
  name: 'Hospitals Management',
  type: 'page',
  description: 'Manage all hospitals',
  actions: ['view', 'add', 'edit', 'delete'],
  children: {
    'admin.hospitals.addButton': { name: 'Add Hospital Button', type: 'action', actions: ['view', 'add'] },
    'admin.hospitals.search': { name: 'Search', type: 'filter' },
    'admin.hospitals.regionFilter': { name: 'Region Filter', type: 'filter' },
    'admin.hospitals.statusFilter': { name: 'Status Filter', type: 'filter' },
    'admin.hospitals.list': { name: 'Hospital Cards', type: 'table' },
    'admin.hospitals.inviteManager': { name: 'Invite Manager Action', type: 'action', actions: ['view', 'add'] },
    'admin.hospitals.createModal': { name: 'Create Hospital Modal', type: 'modal', actions: ['view', 'add'] },
  },
};

const adminRevenue: RegistryNode = {
  name: 'Revenue Dashboard',
  type: 'page',
  description: 'Revenue analytics and breakdowns',
  actions: ['view'],
  children: {
    'admin.revenue.kpi': {
      name: 'Revenue KPIs',
      type: 'section',
      children: {
        'admin.revenue.kpi.mrr': { name: 'Monthly Revenue', type: 'card' },
        'admin.revenue.kpi.arr': { name: 'Annual Revenue', type: 'card' },
        'admin.revenue.kpi.avgRevenue': { name: 'Avg Revenue per Hospital', type: 'card' },
        'admin.revenue.kpi.productsSold': { name: 'Products Sold', type: 'card' },
      },
    },
    'admin.revenue.byProduct': { name: 'Revenue by Product', type: 'card' },
    'admin.revenue.byRegion': { name: 'Revenue by Region', type: 'card' },
  },
};

const adminProducts: RegistryNode = {
  name: 'Products Management',
  type: 'page',
  description: 'Manage products and regional pricing',
  actions: ['view', 'add', 'edit'],
  children: {
    'admin.products.addButton': { name: 'Add Product Button', type: 'action', actions: ['view', 'add'] },
    'admin.products.regionFilter': { name: 'Region Filter', type: 'filter' },
    'admin.products.list': { name: 'Product Cards', type: 'table' },
    'admin.products.productModal': { name: 'Product Modal', type: 'modal', actions: ['view', 'add', 'edit'] },
    'admin.products.pricingModal': { name: 'Pricing Modal', type: 'modal', actions: ['view', 'edit'] },
  },
};

const adminSubscriptions: RegistryNode = {
  name: 'Subscriptions Management',
  type: 'page',
  description: 'Manage hospital subscriptions and billing',
  actions: ['view', 'add', 'edit', 'delete'],
  children: {
    'admin.subscriptions.createButton': { name: 'Create Subscription Button', type: 'action', actions: ['view', 'add'] },
    'admin.subscriptions.stats': {
      name: 'Stats Cards',
      type: 'section',
      children: {
        'admin.subscriptions.stats.total': { name: 'Total Subscriptions', type: 'card' },
        'admin.subscriptions.stats.active': { name: 'Active Count', type: 'card' },
        'admin.subscriptions.stats.trial': { name: 'Trial Count', type: 'card' },
        'admin.subscriptions.stats.revenue': { name: 'Monthly Revenue', type: 'card' },
      },
    },
    'admin.subscriptions.productBreakdown': { name: 'Revenue by Product', type: 'card' },
    'admin.subscriptions.table': { name: 'Subscriptions Table', type: 'table', actions: ['view', 'edit', 'delete'] },
    'admin.subscriptions.createModal': { name: 'Create Subscription Modal', type: 'modal', actions: ['view', 'add'] },
  },
};

const adminDiscounts: RegistryNode = {
  name: 'Discounts Management',
  type: 'page',
  description: 'Manage discount codes and promotions',
  actions: ['view', 'add', 'edit'],
  children: {
    'admin.discounts.createButton': { name: 'Create Discount Button', type: 'action', actions: ['view', 'add'] },
    'admin.discounts.table': { name: 'Discounts Table', type: 'table', actions: ['view', 'edit'] },
    'admin.discounts.modal': { name: 'Create/Edit Modal', type: 'modal', actions: ['view', 'add', 'edit'] },
  },
};

const adminCompliance: RegistryNode = {
  name: 'Compliance',
  type: 'page',
  description: 'Legal documents and compliance tracking',
  actions: ['view', 'add', 'edit'],
  children: {
    'admin.compliance.overview': {
      name: 'Overview Tab',
      type: 'tab',
      children: {
        'admin.compliance.overview.stats': {
          name: 'Stats Cards',
          type: 'section',
          children: {
            'admin.compliance.overview.stats.overall': { name: 'Overall Compliance', type: 'card' },
            'admin.compliance.overview.stats.compliant': { name: 'Fully Compliant', type: 'card' },
            'admin.compliance.overview.stats.pending': { name: 'Pending', type: 'card' },
            'admin.compliance.overview.stats.activeDocuments': { name: 'Active Documents', type: 'card' },
          },
        },
        'admin.compliance.overview.needsAttention': { name: 'Hospitals Needing Attention', type: 'card' },
      },
    },
    'admin.compliance.documents': {
      name: 'Documents Tab',
      type: 'tab',
      actions: ['view', 'add', 'edit'],
      children: {
        'admin.compliance.documents.createButton': { name: 'Create Document Button', type: 'action', actions: ['view', 'add'] },
        'admin.compliance.documents.list': { name: 'Documents List', type: 'table' },
      },
    },
    'admin.compliance.byHospital': {
      name: 'By Hospital Tab',
      type: 'tab',
      children: {
        'admin.compliance.byHospital.table': { name: 'Hospital Compliance Table', type: 'table' },
      },
    },
  },
};

const adminSystem: RegistryNode = {
  name: 'System Settings',
  type: 'page',
  description: 'Global system configuration',
  actions: ['view', 'edit'],
};

const adminRbac: RegistryNode = {
  name: 'Access Control',
  type: 'page',
  description: 'RBAC permission management',
  actions: ['view', 'edit'],
};

const adminSpecializations: RegistryNode = {
  name: 'Specializations',
  type: 'page',
  description: 'Medical specializations management',
  actions: ['view', 'add', 'edit', 'delete'],
};

// ---------------------------------------------------------------------------
// FULL REGISTRY
// ---------------------------------------------------------------------------

export const PERMISSION_REGISTRY: Record<string, RegistryNode> = {
  // Hospital Module
  'hospital.dashboard': hospitalDashboard,
  'hospital.doctors': hospitalDoctors,
  'hospital.doctors.detail': hospitalDoctorDetail,
  'hospital.patients': hospitalPatients,
  'hospital.staff': hospitalStaff,
  'hospital.appointments': hospitalAppointments,
  'hospital.billing': hospitalBilling,
  'hospital.settings': hospitalSettings,
  'hospital.analytics': hospitalAnalytics,
  'hospital.medical-reports': hospitalMedicalReports,

  // Admin Module
  'admin.dashboard': adminDashboard,
  'admin.hospitals': adminHospitals,
  'admin.revenue': adminRevenue,
  'admin.products': adminProducts,
  'admin.subscriptions': adminSubscriptions,
  'admin.discounts': adminDiscounts,
  'admin.compliance': adminCompliance,
  'admin.system': adminSystem,
  'admin.rbac': adminRbac,
  'admin.specializations': adminSpecializations,
};

// ---------------------------------------------------------------------------
// UTILITY: Flatten tree to a list for database sync
// ---------------------------------------------------------------------------

export interface FlatResource {
  code: string;
  name: string;
  description?: string;
  category: 'admin' | 'hospital';
  element_type: ElementType;
  parent_code: string | null;
  actions: string[];
  sort_order: number;
}

/**
 * Flattens the permission registry tree into a list of resources
 * suitable for database insertion / sync.
 */
export function flattenRegistry(): FlatResource[] {
  const result: FlatResource[] = [];
  let sortOrder = 0;

  function walk(code: string, node: RegistryNode, parentCode: string | null) {
    const category = code.startsWith('admin.') ? 'admin' : 'hospital';
    const actions = node.actions ?? ['view'];

    result.push({
      code,
      name: node.name,
      description: node.description,
      category: category as 'admin' | 'hospital',
      element_type: node.type,
      parent_code: parentCode,
      actions,
      sort_order: sortOrder++,
    });

    if (node.children) {
      for (const [childCode, childNode] of Object.entries(node.children)) {
        walk(childCode, childNode, code);
      }
    }
  }

  for (const [code, node] of Object.entries(PERMISSION_REGISTRY)) {
    walk(code, node, null);
  }

  return result;
}

/**
 * Build a nested tree from the flat registry for the admin RBAC UI.
 * Groups top-level entries by category.
 */
export interface TreeNode {
  code: string;
  name: string;
  description?: string;
  type: ElementType;
  actions: string[];
  children: TreeNode[];
}

export function buildRegistryTree(): { hospital: TreeNode[]; admin: TreeNode[] } {
  const hospital: TreeNode[] = [];
  const admin: TreeNode[] = [];

  function toTreeNode(code: string, node: RegistryNode): TreeNode {
    const children: TreeNode[] = [];
    if (node.children) {
      for (const [childCode, childNode] of Object.entries(node.children)) {
        children.push(toTreeNode(childCode, childNode));
      }
    }
    return {
      code,
      name: node.name,
      description: node.description,
      type: node.type,
      actions: node.actions ?? ['view'],
      children,
    };
  }

  for (const [code, node] of Object.entries(PERMISSION_REGISTRY)) {
    const treeNode = toTreeNode(code, node);
    if (code.startsWith('admin.')) {
      admin.push(treeNode);
    } else {
      hospital.push(treeNode);
    }
  }

  return { hospital, admin };
}

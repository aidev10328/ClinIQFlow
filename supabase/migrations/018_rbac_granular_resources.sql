-- =============================================
-- RBAC Granular Resources Migration
-- =============================================
-- Adds granular child resources for every UI element
-- (cards, charts, filters, actions, metrics, tables, etc.)
-- Adds STAFF and PATIENT roles with default permissions.
-- =============================================

-- 1. Add element_type column to rbac_resources
ALTER TABLE rbac_resources ADD COLUMN IF NOT EXISTS element_type TEXT DEFAULT 'page';

-- Update existing resources with element_type = 'page'
UPDATE rbac_resources SET element_type = 'page' WHERE element_type IS NULL OR element_type = 'page';

-- =============================================
-- 2. Add new hospital pages that are missing
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, path_pattern, sort_order, element_type) VALUES
    ('hospital.appointments', 'Appointments', 'Appointment scheduling and management', 'hospital', '/hospital/appointments', 125, 'page'),
    ('hospital.analytics', 'Analytics', 'Analytics and reporting', 'hospital', '/hospital/analytics', 145, 'page'),
    ('hospital.medical-reports', 'Medical Reports', 'Medical reports management', 'hospital', '/hospital/medical-reports', 155, 'page'),
    ('admin.specializations', 'Specializations', 'Medical specializations management', 'admin', '/admin/specializations', 85, 'page')
ON CONFLICT (code) DO UPDATE SET element_type = 'page';

-- =============================================
-- 3. HOSPITAL DASHBOARD — Granular Resources
-- =============================================

-- KPI Section
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.dashboard.kpi', 'KPI Cards', 'Dashboard KPI summary cards', 'hospital', 'hospital.dashboard', 101, 'section'),
    ('hospital.dashboard.kpi.doctors', 'Doctors Card', 'Active doctors count + pending', 'hospital', 'hospital.dashboard.kpi', 102, 'card'),
    ('hospital.dashboard.kpi.patients', 'Patients Card', 'Total patients + today new', 'hospital', 'hospital.dashboard.kpi', 103, 'card'),
    ('hospital.dashboard.kpi.staff', 'Staff Card', 'Active staff count', 'hospital', 'hospital.dashboard.kpi', 104, 'card'),
    ('hospital.dashboard.kpi.appointments', 'Appointments Card', 'Today appointment count', 'hospital', 'hospital.dashboard.kpi', 105, 'card'),
    ('hospital.dashboard.kpi.licenses', 'Licenses Card', 'Used/total licenses', 'hospital', 'hospital.dashboard.kpi', 106, 'card'),
    ('hospital.dashboard.kpi.invites', 'Invites Card', 'Pending invite count', 'hospital', 'hospital.dashboard.kpi', 107, 'card')
ON CONFLICT (code) DO NOTHING;

-- Charts Section
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.dashboard.charts', 'Charts', 'Dashboard charts section', 'hospital', 'hospital.dashboard', 110, 'section'),
    ('hospital.dashboard.charts.licensesDonut', 'License Usage Donut', 'Donut chart of license usage by product', 'hospital', 'hospital.dashboard.charts', 111, 'chart'),
    ('hospital.dashboard.charts.patientsDonut', 'Patients Donut', 'New vs returning patients donut', 'hospital', 'hospital.dashboard.charts', 112, 'chart'),
    ('hospital.dashboard.charts.patientsDonut.timeFilter', 'Patients Donut Time Filter', 'Day/Week/Month/Year pills', 'hospital', 'hospital.dashboard.charts.patientsDonut', 113, 'filter'),
    ('hospital.dashboard.charts.appointmentsTrend', 'Appointments Trend', 'Area chart of scheduled vs walk-in appointments', 'hospital', 'hospital.dashboard.charts', 114, 'chart'),
    ('hospital.dashboard.charts.appointmentsTrend.doctorFilter', 'Appt Trend Doctor Filter', 'Filter by doctor dropdown', 'hospital', 'hospital.dashboard.charts.appointmentsTrend', 115, 'filter'),
    ('hospital.dashboard.charts.appointmentsTrend.timeFilter', 'Appt Trend Time Filter', 'Day/Week/Month/Year pills', 'hospital', 'hospital.dashboard.charts.appointmentsTrend', 116, 'filter'),
    ('hospital.dashboard.charts.patientsTrend', 'Patients Trend', 'Line chart of new vs returning patients', 'hospital', 'hospital.dashboard.charts', 117, 'chart'),
    ('hospital.dashboard.charts.patientsTrend.doctorFilter', 'Patient Trend Doctor Filter', 'Filter by doctor dropdown', 'hospital', 'hospital.dashboard.charts.patientsTrend', 118, 'filter'),
    ('hospital.dashboard.charts.patientsTrend.timeFilter', 'Patient Trend Time Filter', 'Day/Week/Month/Year pills', 'hospital', 'hospital.dashboard.charts.patientsTrend', 119, 'filter')
ON CONFLICT (code) DO NOTHING;

-- Schedule Section
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.dashboard.schedule', 'Doctor Schedule', 'Doctor schedule card with weekly shifts, time off, and metrics', 'hospital', 'hospital.dashboard', 120, 'section'),
    ('hospital.dashboard.schedule.doctorSelect', 'Doctor Selector', 'Doctor dropdown picker', 'hospital', 'hospital.dashboard.schedule', 121, 'filter'),
    ('hospital.dashboard.schedule.statusBadge', 'Online/Offline Status', 'Doctor check-in status badge', 'hospital', 'hospital.dashboard.schedule', 122, 'metric'),
    ('hospital.dashboard.schedule.weeklyShifts', 'Weekly Shifts Table', 'AM/PM/NT shifts for each day', 'hospital', 'hospital.dashboard.schedule', 123, 'table'),
    ('hospital.dashboard.schedule.timeOff', 'Time Off', 'Upcoming leave entries + calendar view', 'hospital', 'hospital.dashboard.schedule', 124, 'card'),
    ('hospital.dashboard.schedule.doctorMetrics', 'Doctor Metrics', '2x2 grid: Work Days, Upcoming Leaves, Licenses, Patients Seen', 'hospital', 'hospital.dashboard.schedule', 125, 'card')
ON CONFLICT (code) DO NOTHING;

-- Quick Actions Section
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.dashboard.quickActions', 'Quick Actions', 'Dashboard quick action buttons', 'hospital', 'hospital.dashboard', 130, 'section'),
    ('hospital.dashboard.quickActions.inviteDoctor', 'Invite Doctor', 'Quick action to invite a doctor', 'hospital', 'hospital.dashboard.quickActions', 131, 'action'),
    ('hospital.dashboard.quickActions.addPatient', 'Add Patient', 'Quick action to add a patient', 'hospital', 'hospital.dashboard.quickActions', 132, 'action'),
    ('hospital.dashboard.quickActions.manageStaff', 'Manage Staff', 'Quick action to manage staff', 'hospital', 'hospital.dashboard.quickActions', 133, 'action'),
    ('hospital.dashboard.quickActions.manageLicenses', 'Manage Licenses', 'Quick action to manage licenses', 'hospital', 'hospital.dashboard.quickActions', 134, 'action')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 4. HOSPITAL DOCTORS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.doctors.inviteButton', 'Invite Doctor Button', 'Button to invite a new doctor', 'hospital', 'hospital.doctors', 201, 'action'),
    ('hospital.doctors.list', 'Doctors List', 'Table of all doctors', 'hospital', 'hospital.doctors', 202, 'table'),
    ('hospital.doctors.search', 'Doctor Search', 'Search/filter doctors', 'hospital', 'hospital.doctors', 203, 'filter')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 5. HOSPITAL DOCTOR DETAIL — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.doctors.detail.header', 'Doctor Header', 'Avatar, name, status, metadata badges', 'hospital', 'hospital.doctors.detail', 301, 'section'),
    ('hospital.doctors.detail.header.assignLicense', 'Assign License Button', 'Assign a license to doctor', 'hospital', 'hospital.doctors.detail.header', 302, 'action'),
    ('hospital.doctors.detail.overview', 'Overview Tab', 'Personal and professional details', 'hospital', 'hospital.doctors.detail', 303, 'tab'),
    ('hospital.doctors.detail.overview.personalInfo', 'Personal Information', 'Name, phone, national ID, DOB, gender, address, emergency contact', 'hospital', 'hospital.doctors.detail.overview', 304, 'card'),
    ('hospital.doctors.detail.overview.professionalDetails', 'Professional Details', 'Specialization, department, employment type, qualification, fees', 'hospital', 'hospital.doctors.detail.overview', 305, 'card'),
    ('hospital.doctors.detail.schedule', 'Schedule Tab', 'Doctor schedule and time off', 'hospital', 'hospital.doctors.detail', 306, 'tab'),
    ('hospital.doctors.detail.schedule.weeklyGrid', 'Weekly Schedule Grid', '7-day shift checkboxes + appointment duration', 'hospital', 'hospital.doctors.detail.schedule', 307, 'card'),
    ('hospital.doctors.detail.schedule.timeOff', 'Time Off Management', 'Calendar + leave list + add leave', 'hospital', 'hospital.doctors.detail.schedule', 308, 'card'),
    ('hospital.doctors.detail.schedule.shiftTimings', 'Shift Timings', 'Edit AM/PM/NT shift start and end times', 'hospital', 'hospital.doctors.detail.schedule', 309, 'modal')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 6. HOSPITAL PATIENTS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.patients.stats', 'Stats Badges', 'Total patients, appointments, reports counts', 'hospital', 'hospital.patients', 401, 'section'),
    ('hospital.patients.addButton', 'Add Patient Button', 'Button to add a new patient', 'hospital', 'hospital.patients', 402, 'action'),
    ('hospital.patients.search', 'Patient Search', 'Search patients by name', 'hospital', 'hospital.patients', 403, 'filter'),
    ('hospital.patients.list', 'Patients Table', 'Table of patients with name, phone, email, etc.', 'hospital', 'hospital.patients', 404, 'table'),
    ('hospital.patients.details', 'Patient Details Panel', 'Split-view details panel', 'hospital', 'hospital.patients', 405, 'section'),
    ('hospital.patients.details.appointments', 'Appointments View', 'Appointment cards with reschedule/cancel actions', 'hospital', 'hospital.patients.details', 406, 'card'),
    ('hospital.patients.details.reports', 'Reports View', 'Medical report cards with generate action', 'hospital', 'hospital.patients.details', 407, 'card'),
    ('hospital.patients.modal', 'Add/Edit Patient Modal', 'Patient form modal', 'hospital', 'hospital.patients', 408, 'modal')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 7. HOSPITAL STAFF — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.staff.inviteButton', 'Invite Staff Button', 'Button to invite staff', 'hospital', 'hospital.staff', 501, 'action'),
    ('hospital.staff.list', 'Staff List', 'Table of all staff members', 'hospital', 'hospital.staff', 502, 'table')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 8. HOSPITAL APPOINTMENTS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.appointments.schedule', 'Schedule Tab', 'Appointment schedule view', 'hospital', 'hospital.appointments', 601, 'tab'),
    ('hospital.appointments.scheduler', 'Scheduler Tab', 'Appointment booking scheduler', 'hospital', 'hospital.appointments', 602, 'tab'),
    ('hospital.appointments.scheduler.doctorSelect', 'Doctor Selector', 'Select doctor for scheduling', 'hospital', 'hospital.appointments.scheduler', 603, 'filter'),
    ('hospital.appointments.scheduler.calendar', 'Calendar View', 'Calendar for slot selection', 'hospital', 'hospital.appointments.scheduler', 604, 'card'),
    ('hospital.appointments.scheduler.slotGeneration', 'Slot Generation', 'Generate appointment slots', 'hospital', 'hospital.appointments.scheduler', 605, 'action'),
    ('hospital.appointments.scheduler.booking', 'Booking Modal', 'Book an appointment modal', 'hospital', 'hospital.appointments.scheduler', 606, 'modal'),
    ('hospital.appointments.calendar', 'Calendar Tab', 'Full calendar view', 'hospital', 'hospital.appointments', 607, 'tab'),
    ('hospital.appointments.queue', 'Queue Tab', 'Daily appointment queue', 'hospital', 'hospital.appointments', 608, 'tab'),
    ('hospital.appointments.patients', 'Patients Tab', 'Patients list within appointments', 'hospital', 'hospital.appointments', 609, 'tab')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 9. HOSPITAL BILLING — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.billing.subscription', 'Subscription Card', 'Status, products, pricing, billing cycle', 'hospital', 'hospital.billing', 701, 'card'),
    ('hospital.billing.licenseStats', 'License Usage', 'Product license usage with progress bars', 'hospital', 'hospital.billing', 702, 'card'),
    ('hospital.billing.licenseStats.assignButton', 'Assign License Button', 'Assign license to doctor', 'hospital', 'hospital.billing.licenseStats', 703, 'action'),
    ('hospital.billing.activeLicenses', 'Active Licenses Table', 'Doctor, product, assigned date, status, revoke action', 'hospital', 'hospital.billing', 704, 'table')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 10. HOSPITAL SETTINGS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('hospital.settings.basicInfo', 'Basic Information', 'Hospital name, address, contact', 'hospital', 'hospital.settings', 801, 'section'),
    ('hospital.settings.billingInfo', 'Billing Information', 'Payment methods and billing address', 'hospital', 'hospital.settings', 802, 'section'),
    ('hospital.settings.regionalSettings', 'Regional Settings', 'Timezone, currency, locale', 'hospital', 'hospital.settings', 803, 'section')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 11. ADMIN DASHBOARD — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.dashboard.kpi', 'KPI Cards', 'Admin dashboard KPI summary cards', 'admin', 'admin.dashboard', 1001, 'section'),
    ('admin.dashboard.kpi.hospitals', 'Hospitals Card', 'Total hospitals count', 'admin', 'admin.dashboard.kpi', 1002, 'card'),
    ('admin.dashboard.kpi.revenue', 'Revenue Card', 'MRR value', 'admin', 'admin.dashboard.kpi', 1003, 'card'),
    ('admin.dashboard.kpi.active', 'Active Subscriptions Card', 'Active subscription count', 'admin', 'admin.dashboard.kpi', 1004, 'card'),
    ('admin.dashboard.kpi.trials', 'Trials Card', 'Active trial count', 'admin', 'admin.dashboard.kpi', 1005, 'card'),
    ('admin.dashboard.kpi.pastDue', 'Past Due Card', 'Past due count', 'admin', 'admin.dashboard.kpi', 1006, 'card'),
    ('admin.dashboard.kpi.new', 'New This Month Card', 'New hospitals this month', 'admin', 'admin.dashboard.kpi', 1007, 'card'),
    ('admin.dashboard.charts', 'Charts', 'Admin dashboard charts section', 'admin', 'admin.dashboard', 1010, 'section'),
    ('admin.dashboard.charts.subscriptionsDonut', 'Subscriptions Status Donut', 'Active/Trial/Past Due breakdown', 'admin', 'admin.dashboard.charts', 1011, 'chart'),
    ('admin.dashboard.charts.regionsDonut', 'Regions Distribution Donut', 'Hospital count by region', 'admin', 'admin.dashboard.charts', 1012, 'chart'),
    ('admin.dashboard.charts.revenueDonut', 'Revenue Breakdown Donut', 'MRR breakdown', 'admin', 'admin.dashboard.charts', 1013, 'chart'),
    ('admin.dashboard.charts.hospitalGrowth', 'Hospital Growth Chart', 'New hospitals over time', 'admin', 'admin.dashboard.charts', 1014, 'chart'),
    ('admin.dashboard.charts.hospitalGrowth.regionFilter', 'Hospital Growth Region Filter', 'Filter by region', 'admin', 'admin.dashboard.charts.hospitalGrowth', 1015, 'filter'),
    ('admin.dashboard.charts.hospitalGrowth.timeFilter', 'Hospital Growth Time Filter', 'Day/Week/Month/Year pills', 'admin', 'admin.dashboard.charts.hospitalGrowth', 1016, 'filter'),
    ('admin.dashboard.charts.revenueTrend', 'Revenue Trend Chart', 'MRR over time', 'admin', 'admin.dashboard.charts', 1017, 'chart'),
    ('admin.dashboard.charts.revenueTrend.regionFilter', 'Revenue Trend Region Filter', 'Filter by region', 'admin', 'admin.dashboard.charts.revenueTrend', 1018, 'filter'),
    ('admin.dashboard.charts.revenueTrend.timeFilter', 'Revenue Trend Time Filter', 'Day/Week/Month/Year pills', 'admin', 'admin.dashboard.charts.revenueTrend', 1019, 'filter'),
    ('admin.dashboard.trialsExpiring', 'Trials Expiring Alert', 'Hospitals with expiring trials', 'admin', 'admin.dashboard', 1020, 'card')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 12. ADMIN HOSPITALS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.hospitals.addButton', 'Add Hospital Button', 'Button to add a new hospital', 'admin', 'admin.hospitals', 1101, 'action'),
    ('admin.hospitals.search', 'Search', 'Search hospitals by name/city/email', 'admin', 'admin.hospitals', 1102, 'filter'),
    ('admin.hospitals.regionFilter', 'Region Filter', 'Filter by region dropdown', 'admin', 'admin.hospitals', 1103, 'filter'),
    ('admin.hospitals.statusFilter', 'Status Filter', 'Filter by status dropdown', 'admin', 'admin.hospitals', 1104, 'filter'),
    ('admin.hospitals.list', 'Hospital Cards', 'Grid of hospital cards', 'admin', 'admin.hospitals', 1105, 'table'),
    ('admin.hospitals.inviteManager', 'Invite Manager Action', 'Invite a manager to hospital', 'admin', 'admin.hospitals', 1106, 'action'),
    ('admin.hospitals.createModal', 'Create Hospital Modal', 'Modal form to create hospital', 'admin', 'admin.hospitals', 1107, 'modal')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 13. ADMIN REVENUE — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.revenue.kpi', 'Revenue KPIs', 'Revenue stats cards', 'admin', 'admin.revenue', 1201, 'section'),
    ('admin.revenue.kpi.mrr', 'Monthly Revenue', 'MRR card', 'admin', 'admin.revenue.kpi', 1202, 'card'),
    ('admin.revenue.kpi.arr', 'Annual Revenue', 'ARR card', 'admin', 'admin.revenue.kpi', 1203, 'card'),
    ('admin.revenue.kpi.avgRevenue', 'Avg Revenue per Hospital', 'Average revenue card', 'admin', 'admin.revenue.kpi', 1204, 'card'),
    ('admin.revenue.kpi.productsSold', 'Products Sold', 'Products sold card', 'admin', 'admin.revenue.kpi', 1205, 'card'),
    ('admin.revenue.byProduct', 'Revenue by Product', 'Product revenue breakdown', 'admin', 'admin.revenue', 1206, 'card'),
    ('admin.revenue.byRegion', 'Revenue by Region', 'Regional revenue breakdown', 'admin', 'admin.revenue', 1207, 'card')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 14. ADMIN PRODUCTS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.products.addButton', 'Add Product Button', 'Button to add a new product', 'admin', 'admin.products', 1301, 'action'),
    ('admin.products.regionFilter', 'Region Filter', 'Filter products by region', 'admin', 'admin.products', 1302, 'filter'),
    ('admin.products.list', 'Product Cards', 'Grid of product cards', 'admin', 'admin.products', 1303, 'table'),
    ('admin.products.productModal', 'Product Modal', 'Create/edit product modal', 'admin', 'admin.products', 1304, 'modal'),
    ('admin.products.pricingModal', 'Pricing Modal', 'Edit product pricing modal', 'admin', 'admin.products', 1305, 'modal')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 15. ADMIN SUBSCRIPTIONS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.subscriptions.createButton', 'Create Subscription Button', 'Button to create subscription', 'admin', 'admin.subscriptions', 1401, 'action'),
    ('admin.subscriptions.stats', 'Stats Cards', 'Subscription stat cards', 'admin', 'admin.subscriptions', 1402, 'section'),
    ('admin.subscriptions.stats.total', 'Total Subscriptions', 'Total count card', 'admin', 'admin.subscriptions.stats', 1403, 'card'),
    ('admin.subscriptions.stats.active', 'Active Count', 'Active subscriptions card', 'admin', 'admin.subscriptions.stats', 1404, 'card'),
    ('admin.subscriptions.stats.trial', 'Trial Count', 'Trial subscriptions card', 'admin', 'admin.subscriptions.stats', 1405, 'card'),
    ('admin.subscriptions.stats.revenue', 'Monthly Revenue', 'Monthly revenue card', 'admin', 'admin.subscriptions.stats', 1406, 'card'),
    ('admin.subscriptions.productBreakdown', 'Revenue by Product', 'Product revenue breakdown', 'admin', 'admin.subscriptions', 1407, 'card'),
    ('admin.subscriptions.table', 'Subscriptions Table', 'Table of all subscriptions', 'admin', 'admin.subscriptions', 1408, 'table'),
    ('admin.subscriptions.createModal', 'Create Subscription Modal', 'Modal form to create subscription', 'admin', 'admin.subscriptions', 1409, 'modal')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 16. ADMIN DISCOUNTS — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.discounts.createButton', 'Create Discount Button', 'Button to create discount code', 'admin', 'admin.discounts', 1501, 'action'),
    ('admin.discounts.table', 'Discounts Table', 'Table of all discount codes', 'admin', 'admin.discounts', 1502, 'table'),
    ('admin.discounts.modal', 'Create/Edit Modal', 'Discount code form modal', 'admin', 'admin.discounts', 1503, 'modal')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 17. ADMIN COMPLIANCE — Granular Resources
-- =============================================
INSERT INTO rbac_resources (code, name, description, category, parent_code, sort_order, element_type) VALUES
    ('admin.compliance.overview', 'Overview Tab', 'Compliance overview', 'admin', 'admin.compliance', 1601, 'tab'),
    ('admin.compliance.overview.stats', 'Stats Cards', 'Compliance stat cards', 'admin', 'admin.compliance.overview', 1602, 'section'),
    ('admin.compliance.overview.stats.overall', 'Overall Compliance', 'Overall compliance percentage', 'admin', 'admin.compliance.overview.stats', 1603, 'card'),
    ('admin.compliance.overview.stats.compliant', 'Fully Compliant', 'Fully compliant hospital count', 'admin', 'admin.compliance.overview.stats', 1604, 'card'),
    ('admin.compliance.overview.stats.pending', 'Pending', 'Pending compliance count', 'admin', 'admin.compliance.overview.stats', 1605, 'card'),
    ('admin.compliance.overview.stats.activeDocuments', 'Active Documents', 'Active document count', 'admin', 'admin.compliance.overview.stats', 1606, 'card'),
    ('admin.compliance.overview.needsAttention', 'Hospitals Needing Attention', 'Hospitals requiring action', 'admin', 'admin.compliance.overview', 1607, 'card'),
    ('admin.compliance.documents', 'Documents Tab', 'Compliance documents management', 'admin', 'admin.compliance', 1610, 'tab'),
    ('admin.compliance.documents.createButton', 'Create Document Button', 'Button to create document', 'admin', 'admin.compliance.documents', 1611, 'action'),
    ('admin.compliance.documents.list', 'Documents List', 'List of compliance documents', 'admin', 'admin.compliance.documents', 1612, 'table'),
    ('admin.compliance.byHospital', 'By Hospital Tab', 'Per-hospital compliance view', 'admin', 'admin.compliance', 1620, 'tab'),
    ('admin.compliance.byHospital.table', 'Hospital Compliance Table', 'Per-hospital compliance table', 'admin', 'admin.compliance.byHospital', 1621, 'table')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 18. Create actions for ALL new resources
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id, code, element_type FROM rbac_resources
        WHERE id NOT IN (SELECT DISTINCT resource_id FROM rbac_resource_actions)
    LOOP
        -- All resources get view action
        INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
            (r.id, 'view', 'View', 'Can view this resource')
        ON CONFLICT (resource_id, action) DO NOTHING;

        -- Actions/modals/cards with add capability
        IF r.element_type IN ('action', 'modal', 'page', 'section', 'table') THEN
            INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
                (r.id, 'add', 'Add', 'Can add new items')
            ON CONFLICT (resource_id, action) DO NOTHING;
        END IF;

        -- Pages/sections/cards/modals/tables can have edit
        IF r.element_type IN ('page', 'section', 'card', 'modal', 'table', 'tab') THEN
            INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
                (r.id, 'edit', 'Edit', 'Can edit existing items')
            ON CONFLICT (resource_id, action) DO NOTHING;
        END IF;

        -- Pages/tables can have delete
        IF r.element_type IN ('page', 'table') THEN
            INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
                (r.id, 'delete', 'Delete', 'Can delete items')
            ON CONFLICT (resource_id, action) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- =============================================
-- 19. SUPER_ADMIN permissions for all new resources
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM rbac_resources WHERE id NOT IN (
        SELECT resource_id FROM rbac_role_permissions WHERE role = 'SUPER_ADMIN'
    )
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('SUPER_ADMIN', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;
END $$;

-- =============================================
-- 20. HOSPITAL_MANAGER permissions for new hospital resources
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- All hospital.dashboard.* children - view only (inherit from parent)
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.dashboard.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Quick actions - allow add for invite/add actions
    FOR r IN SELECT id FROM rbac_resources WHERE code IN (
        'hospital.dashboard.quickActions.inviteDoctor',
        'hospital.dashboard.quickActions.addPatient'
    )
    LOOP
        UPDATE rbac_role_permissions
        SET allowed_actions = ARRAY['view', 'add']
        WHERE role = 'HOSPITAL_MANAGER' AND resource_id = r.id;
    END LOOP;

    -- Doctors list children - full CRUD
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.doctors.%' AND code NOT LIKE 'hospital.doctors.detail%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Doctor detail children - view and edit
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.doctors.detail.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Patient children - full CRUD
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.patients.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Staff children - full CRUD
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.staff.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Appointments - full access
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.appointments%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Billing children - view only
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.billing.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Billing assign license - view + add
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.billing.licenseStats.assignButton';
    IF r.id IS NOT NULL THEN
        UPDATE rbac_role_permissions
        SET allowed_actions = ARRAY['view', 'add']
        WHERE role = 'HOSPITAL_MANAGER' AND resource_id = r.id;
    END IF;

    -- Settings children - view + edit
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.settings.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Analytics / Medical Reports - view
    FOR r IN SELECT id FROM rbac_resources WHERE code IN ('hospital.analytics', 'hospital.medical-reports')
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;
END $$;

-- =============================================
-- 21. DOCTOR permissions for new hospital resources
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Dashboard - view all KPI/chart children
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.dashboard.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Doctor detail children - limited
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.doctors.detail.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Schedule tab children - view + edit own schedule
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.doctors.detail.schedule.%'
    LOOP
        UPDATE rbac_role_permissions
        SET allowed_actions = ARRAY['view', 'edit']
        WHERE role = 'DOCTOR' AND resource_id = r.id;
    END LOOP;

    -- Patient children - view, add, edit (not delete)
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.patients.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Appointments - view + add + edit
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.appointments%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;
END $$;

-- =============================================
-- 22. STAFF role — Limited hospital access
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Dashboard - view only
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.dashboard';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Dashboard children - view only
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.dashboard.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Patients - view + add + edit (no delete)
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.patients';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["demographics"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.patients.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Appointments - view + add + edit
    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.appointments%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Billing - view only
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.billing';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    FOR r IN SELECT id FROM rbac_resources WHERE code LIKE 'hospital.billing.%'
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;
END $$;

-- =============================================
-- 23. PATIENT role — Minimal access (future portal)
-- =============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Patients page - view + edit own record
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.patients';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('PATIENT', r.id, ARRAY['view', 'edit'], '{"viewable": ["demographics", "medicalHistory", "insurance"], "editable": ["demographics"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Appointments - view + add (book own appointments)
    FOR r IN SELECT id FROM rbac_resources WHERE code IN ('hospital.appointments', 'hospital.appointments.schedule', 'hospital.appointments.calendar')
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('PATIENT', r.id, ARRAY['view', 'add'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;

    -- Medical reports - view only
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.medical-reports';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('PATIENT', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;
END $$;

export interface ImportColumn {
  column: string;
  label: string;
  required: boolean;
  type: 'text' | 'email' | 'phone' | 'date' | 'number' | 'enum';
  options?: string[];
}

export const PATIENT_COLUMNS: ImportColumn[] = [
  { column: 'first_name', label: 'First Name', required: true, type: 'text' },
  { column: 'last_name', label: 'Last Name', required: true, type: 'text' },
  { column: 'email', label: 'Email', required: false, type: 'email' },
  { column: 'phone', label: 'Phone', required: false, type: 'phone' },
  { column: 'date_of_birth', label: 'Date of Birth', required: false, type: 'date' },
  { column: 'gender', label: 'Gender', required: false, type: 'enum', options: ['male', 'female', 'other'] },
  { column: 'address', label: 'Address', required: false, type: 'text' },
  { column: 'city', label: 'City', required: false, type: 'text' },
  { column: 'state', label: 'State', required: false, type: 'text' },
  { column: 'postal_code', label: 'Postal Code', required: false, type: 'text' },
  { column: 'country', label: 'Country', required: false, type: 'text' },
  { column: 'insurance_provider', label: 'Insurance Provider', required: false, type: 'text' },
  { column: 'insurance_number', label: 'Insurance Number', required: false, type: 'text' },
  { column: 'emergency_contact_name', label: 'Emergency Contact Name', required: false, type: 'phone' },
  { column: 'emergency_contact_phone', label: 'Emergency Contact Phone', required: false, type: 'phone' },
  { column: 'notes', label: 'Notes', required: false, type: 'text' },
  { column: 'status', label: 'Status', required: false, type: 'enum', options: ['active', 'inactive'] },
];

export const DOCTOR_COLUMNS: ImportColumn[] = [
  { column: 'email', label: 'Email', required: true, type: 'email' },
  { column: 'full_name', label: 'Full Name', required: true, type: 'text' },
  { column: 'specialization', label: 'Specialization', required: false, type: 'text' },
  { column: 'qualification', label: 'Qualification', required: false, type: 'text' },
  { column: 'license_number', label: 'License Number', required: false, type: 'text' },
  { column: 'years_of_experience', label: 'Years of Experience', required: false, type: 'number' },
  { column: 'education', label: 'Education', required: false, type: 'text' },
  { column: 'consultation_fee', label: 'Consultation Fee', required: false, type: 'number' },
  { column: 'department', label: 'Department', required: false, type: 'text' },
  { column: 'employment_type', label: 'Employment Type', required: false, type: 'text' },
  { column: 'phone', label: 'Phone', required: false, type: 'phone' },
  { column: 'date_of_birth', label: 'Date of Birth', required: false, type: 'date' },
  { column: 'gender', label: 'Gender', required: false, type: 'enum', options: ['male', 'female', 'other'] },
  { column: 'address_line1', label: 'Address Line 1', required: false, type: 'text' },
  { column: 'city', label: 'City', required: false, type: 'text' },
  { column: 'state', label: 'State', required: false, type: 'text' },
  { column: 'postal_code', label: 'Postal Code', required: false, type: 'text' },
  { column: 'country', label: 'Country', required: false, type: 'text' },
];

// Aliases for fuzzy auto-mapping
export const COLUMN_ALIASES: Record<string, string[]> = {
  first_name: ['firstname', 'first', 'fname', 'given_name', 'givenname'],
  last_name: ['lastname', 'last', 'lname', 'surname', 'family_name', 'familyname'],
  full_name: ['fullname', 'name', 'doctor_name', 'doctorname'],
  date_of_birth: ['dob', 'birth_date', 'birthday', 'birthdate'],
  phone: ['mobile', 'cell', 'telephone', 'contact_number', 'phone_number', 'phonenumber', 'mobile_number'],
  email: ['email_address', 'e_mail', 'emailaddress'],
  gender: ['sex'],
  postal_code: ['zip', 'zipcode', 'zip_code', 'pincode', 'pin_code', 'postcode'],
  address: ['street', 'street_address', 'address_line'],
  address_line1: ['street', 'street_address', 'address', 'address_line'],
  insurance_provider: ['insurer', 'insurance_company', 'insurance'],
  insurance_number: ['policy_number', 'insurance_id', 'policy_id'],
  emergency_contact_name: ['emergency_name', 'emergency_contact', 'kin_name', 'next_of_kin'],
  emergency_contact_phone: ['emergency_phone', 'emergency_number', 'kin_phone'],
  specialization: ['specialty', 'speciality', 'spec'],
  qualification: ['degree', 'degrees', 'qualifications'],
  license_number: ['license', 'licence', 'licence_number', 'registration', 'registration_number'],
  years_of_experience: ['experience', 'years_experience', 'exp', 'yoe'],
  consultation_fee: ['fee', 'fees', 'charge', 'consultation_charge'],
  employment_type: ['employment', 'type', 'emp_type'],
};

export type School = {
  id: string;
  school_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at: string;
};

export type Device = {
  id: string;
  school_id: string | null;
  device_id: string;
  device_name: string | null;
  os: string | null;
  app_version: string | null;
  last_seen_at: string | null;
  last_ip: string | null;
  status: "Active" | "Suspended" | "Revoked";
  created_at: string;
  updated_at: string;
  schools?: Pick<School, "school_name"> | null;
};

export type License = {
  id: string;
  license_id: string;
  school_id: string | null;
  device_id: string;
  plan: "Trial" | "Monthly" | "Annual" | "Lifetime";
  status: "Active" | "Suspended" | "Expired" | "Revoked";
  issued_at: string;
  expires_at: string | null;
  maintenance_until: string | null;
  max_users: number;
  features: Record<string, unknown> | null;
  license_key: string | null;
  suspend_reason: string | null;
  revoked_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  schools?: Pick<School, "school_name"> | null;
};

export type Payment = {
  id: string;
  school_id: string | null;
  license_id: string | null;
  amount: number | null;
  payment_date: string | null;
  due_date: string | null;
  payment_mode: string | null;
  status: "Pending" | "Paid" | "Overdue" | "Cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  schools?: Pick<School, "school_name"> | null;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type LicenseCheckin = {
  id: string;
  license_id: string | null;
  device_id: string | null;
  school_id: string | null;
  status_returned: string | null;
  app_version: string | null;
  os: string | null;
  ip_address: string | null;
  checked_at: string;
  notes: string | null;
};

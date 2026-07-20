export type CommunicationChannel = "WhatsApp" | "SMS";
export type CommunicationProvider = "MetaCloud" | "MSG91";
export type CommunicationStatus =
  | "Queued"
  | "Processing"
  | "Submitted"
  | "Sent"
  | "Delivered"
  | "Read"
  | "Failed"
  | "Rejected"
  | "Cancelled";

export type DeviceAuthContext = {
  tokenId: string;
  schoolId: string;
  schoolName: string;
  deviceId: string;
  licenseId: string;
};

export type CommunicationTemplateRow = {
  id: string;
  school_id: string;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  internal_name: string;
  category: string | null;
  provider_template_id: string | null;
  provider_template_name: string | null;
  provider_language_code: string | null;
  dlt_template_id: string | null;
  msg91_flow_id: string | null;
  sender_id: string | null;
  body_preview: string | null;
  variable_definitions: unknown;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CommunicationIntegrationRow = {
  id: string;
  school_id: string;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  status: string;
  encrypted_config: string;
  display_config: Record<string, unknown> | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunicationJobRow = {
  id: string;
  school_id: string;
  batch_id: string | null;
  device_id: string | null;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  template_id: string | null;
  idempotency_key: string | null;
  recipient_type: string | null;
  recipient_entity_id: string | null;
  recipient_name: string | null;
  recipient_phone_masked: string | null;
  encrypted_recipient_phone: string | null;
  variables: Record<string, unknown> | null;
  media_url: string | null;
  requested_by_user_id: string | null;
  requested_by_name: string | null;
  requested_by_role: string | null;
  status: CommunicationStatus;
  provider_message_id: string | null;
  provider_response_code: string | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  queued_at: string | null;
  submitted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

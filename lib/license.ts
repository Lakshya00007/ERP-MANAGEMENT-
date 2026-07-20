import "server-only";

import { getLicensePrivateKey } from "@/lib/env";
import { signVseLicensePayload, type LicensePayload } from "@/lib/license-core";

export type { LicensePayload } from "@/lib/license-core";
export {
  createLicenseId,
  decodeVseLicensePayload as decodeLicensePayload,
  LicenseSigningError,
  normalizeLicenseDeviceId,
} from "@/lib/license-core";

export function signLicensePayload(payload: LicensePayload) {
  return signVseLicensePayload(payload, getLicensePrivateKey());
}

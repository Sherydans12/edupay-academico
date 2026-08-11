export const EDUPAY_SOURCE = 'EDUPAY' as const;
export const MANUAL_SOURCE = 'MANUAL' as const;
export const EDUPAY_SCHEMA_VERSION = '1' as const;
export const EDUPAY_SYNC_ACTOR = 'EDUPAY_SYNC' as const;

export type SupportedSyncSource = typeof EDUPAY_SOURCE;

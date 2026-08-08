import { getIdentitySessionAdapter } from '@/auth/current-session';
import { getClientEnvironment } from '@/config/environment';

import { AcademicApiClient } from './academic-client';

export function createAcademicApiClient(): AcademicApiClient {
  return new AcademicApiClient({
    baseUrl: getClientEnvironment().NEXT_PUBLIC_API_BASE_URL,
    sessionAdapter: getIdentitySessionAdapter(),
  });
}

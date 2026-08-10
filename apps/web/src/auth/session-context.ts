import { createContext } from 'react';

import type { IdentitySessionContextValue } from './session-provider';

export const IdentitySessionContext = createContext<IdentitySessionContextValue | null>(null);

import { Suspense } from 'react';
import { InvitationActivationScreen } from '@/features/account-screens';

export default function ActivatePage() { return <Suspense fallback={null}><InvitationActivationScreen /></Suspense>; }

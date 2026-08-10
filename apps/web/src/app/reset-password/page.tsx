import { Suspense } from 'react';
import { ResetPasswordScreen } from '@/features/account-screens';

export default function ResetPasswordPage() { return <Suspense fallback={null}><ResetPasswordScreen /></Suspense>; }

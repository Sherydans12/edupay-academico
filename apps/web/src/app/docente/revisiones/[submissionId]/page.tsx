import { SubmissionReviewScreen } from '@/features/teacher-screens';

export default async function SubmissionReviewByIdPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return <SubmissionReviewScreen submissionId={submissionId} />;
}

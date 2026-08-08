import { StudentAssignmentScreen } from '@/features/student-screens';

export default async function StudentLearningItemPage({ params }: { params: Promise<{ courseSubjectId: string; learningItemId: string }> }) {
  const { courseSubjectId, learningItemId } = await params;
  return <StudentAssignmentScreen courseSubjectId={courseSubjectId} learningItemId={learningItemId} />;
}

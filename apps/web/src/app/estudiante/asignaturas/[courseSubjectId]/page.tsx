import { StudentSubjectScreen } from '@/features/student-screens';

export default async function StudentCourseSubjectPage({ params }: { params: Promise<{ courseSubjectId: string }> }) {
  const { courseSubjectId } = await params;
  return <StudentSubjectScreen courseSubjectId={courseSubjectId} />;
}

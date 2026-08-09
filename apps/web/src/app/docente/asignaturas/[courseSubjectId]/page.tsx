import { TeacherSubjectScreen } from '@/features/teacher-screens';

export default async function TeacherCourseSubjectPage({ params }: { params: Promise<{ courseSubjectId: string }> }) {
  const { courseSubjectId } = await params;
  return <TeacherSubjectScreen courseSubjectId={courseSubjectId} />;
}

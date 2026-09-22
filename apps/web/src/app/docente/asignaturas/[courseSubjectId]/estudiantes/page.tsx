import { TeacherCourseSubjectRosterScreen } from '@/features/teacher-course-subject-roster';

export default async function TeacherCourseSubjectRosterPage({
  params,
}: {
  params: Promise<{ courseSubjectId: string }>;
}) {
  const { courseSubjectId } = await params;
  return <TeacherCourseSubjectRosterScreen courseSubjectId={courseSubjectId} />;
}

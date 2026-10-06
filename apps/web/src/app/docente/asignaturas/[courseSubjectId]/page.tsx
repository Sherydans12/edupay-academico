import { TeacherSubjectScreen } from '@/features/teacher-screens';

export default async function TeacherCourseSubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseSubjectId: string }>;
  searchParams?: Promise<{ tab?: string; activityId?: string }>;
}) {
  const { courseSubjectId } = await params;
  const sp = searchParams ? await searchParams : {};
  return (
    <TeacherSubjectScreen
      courseSubjectId={courseSubjectId}
      initialActivityId={sp.activityId}
      initialTab={sp.tab}
      v2={true}
    />
  );
}

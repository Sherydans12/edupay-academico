import { TeacherItemEditorScreen } from '@/features/teacher-screens';

export default async function TeacherCourseSubjectItemPage({
  params,
}: {
  params: Promise<{ courseSubjectId: string; learningItemId: string }>;
}) {
  const { courseSubjectId, learningItemId } = await params;
  return (
    <TeacherItemEditorScreen
      courseSubjectId={courseSubjectId}
      learningItemId={learningItemId}
    />
  );
}

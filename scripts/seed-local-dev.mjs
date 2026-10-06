import pg from '../apps/api/node_modules/pg/lib/index.js';

const { Client } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5435/edupay_academico_dev?schema=public';

const client = new Client({ connectionString });

async function seed() {
  console.log('Connecting to database...');
  await client.connect();
  console.log('Connected! Starting seed transaction...');

  await client.query('BEGIN');

  try {
    const tenantId = '11111111-1111-4111-8111-111111111111';

    // 1. Tenant
    console.log('Seeding tenant...');
    await client.query(
      `INSERT INTO tenants (id, created_at, updated_at)
       VALUES ($1, now(), now())
       ON CONFLICT (id) DO NOTHING;`,
      [tenantId],
    );

    // 2. Storage Quota Policy & Usage Accounts
    console.log('Seeding storage quota and usage accounts...');
    await client.query(
      `INSERT INTO storage_quota_policies (
         id, tenant_id, scope_type, scope_key, quota_bytes,
         info_threshold_percent, warning_threshold_percent, critical_threshold_percent,
         effective_at, changed_by_identity_user_id, audit_reason, created_at, updated_at
       ) VALUES 
         (gen_random_uuid(), $1, 'GLOBAL', 'GLOBAL', 10737418240, 75, 90, 95, now(), 'system-bootstrap', 'Initial global policy', now(), now()),
         (gen_random_uuid(), $1, 'TENANT', $1, 5368709120, 75, 90, 95, now(), 'system-bootstrap', 'Initial tenant policy', now(), now())
       ON CONFLICT DO NOTHING;`,
      [tenantId],
    );

    await client.query(
      `INSERT INTO storage_usage_accounts (
         id, tenant_id, scope_type, scope_key, used_bytes, file_count, blob_count,
         last_reconciled_at, created_at, updated_at
       ) VALUES
         (gen_random_uuid(), $1, 'GLOBAL', 'GLOBAL', 0, 0, 0, now(), now(), now()),
         (gen_random_uuid(), $1, 'TENANT', $1, 0, 0, 0, now(), now(), now())
       ON CONFLICT DO NOTHING;`,
      [tenantId],
    );

    // 3. Operational Profile
    console.log('Seeding operational profile...');
    await client.query(
      `INSERT INTO tenant_operational_profiles (
         tenant_id, version, institution_display_name, time_zone,
         updated_by_identity_user_id, created_at, updated_at
       ) VALUES
         ($1, 1, 'Colegio Conquistadores', 'America/Santiago', 'demo-user-admin', now(), now())
       ON CONFLICT (tenant_id) DO NOTHING;`,
      [tenantId],
    );

    // 4. Academic Year
    console.log('Seeding academic year 2026...');
    const yearId = '22222222-2222-4222-8222-222222222222';
    await client.query(
      `INSERT INTO academic_years (
         id, tenant_id, pagination_token, label, start_date, end_date, status, created_at, updated_at
       ) VALUES
         ($1, $2, gen_random_uuid(), '2026', '2026-03-01', '2026-12-31', 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, label) DO NOTHING;`,
      [yearId, tenantId],
    );

    // 5. Courses
    console.log('Seeding courses...');
    const course7AId = '33333333-3333-4333-8333-333333333301';
    const course8AId = '33333333-3333-4333-8333-333333333302';
    await client.query(
      `INSERT INTO courses (
         id, tenant_id, academic_year_id, pagination_token, source, external_reference,
         label, status, created_at, updated_at
       ) VALUES
         ($1, $3, $2, gen_random_uuid(), 'MANUAL', '7B-A-2026', '7º Básico A', 'ACTIVE', now(), now()),
         ($4, $3, $2, gen_random_uuid(), 'MANUAL', '8B-A-2026', '8º Básico A', 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, source, external_reference) DO NOTHING;`,
      [course7AId, yearId, tenantId, course8AId],
    );

    // 6. Subjects
    console.log('Seeding subjects...');
    const subLenguaje = '44444444-4444-4444-8444-444444444401';
    const subMatematicas = '44444444-4444-4444-8444-444444444402';
    const subHistoria = '44444444-4444-4444-8444-444444444403';
    const subCiencias = '44444444-4444-4444-8444-444444444404';

    await client.query(
      `INSERT INTO subjects (
         id, tenant_id, pagination_token, name, status, created_at, updated_at
       ) VALUES
         ($1, $5, gen_random_uuid(), 'Lenguaje y Comunicación', 'ACTIVE', now(), now()),
         ($2, $5, gen_random_uuid(), 'Matemáticas', 'ACTIVE', now(), now()),
         ($3, $5, gen_random_uuid(), 'Historia, Geografía y Ciencias Sociales', 'ACTIVE', now(), now()),
         ($4, $5, gen_random_uuid(), 'Ciencias Naturales', 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, name) DO NOTHING;`,
      [subLenguaje, subMatematicas, subHistoria, subCiencias, tenantId],
    );

    // 7. Course Subjects (Associations)
    console.log('Seeding course subjects...');
    const cs7ALenguaje = '55555555-5555-4555-8555-555555555501';
    const cs7AMat = '55555555-5555-4555-8555-555555555502';
    const cs8ALenguaje = '55555555-5555-4555-8555-555555555503';

    await client.query(
      `INSERT INTO course_subjects (
         id, tenant_id, course_id, subject_id, pagination_token, default_for_course, sort_order, status, created_at, updated_at
       ) VALUES
         ($1, $4, $2, $3, gen_random_uuid(), true, 1, 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, id) DO NOTHING;`,
      [cs7ALenguaje, course7AId, subLenguaje, tenantId],
    );

    await client.query(
      `INSERT INTO course_subjects (
         id, tenant_id, course_id, subject_id, pagination_token, default_for_course, sort_order, status, created_at, updated_at
       ) VALUES
         ($1, $4, $2, $3, gen_random_uuid(), true, 2, 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, id) DO NOTHING;`,
      [cs7AMat, course7AId, subMatematicas, tenantId],
    );

    await client.query(
      `INSERT INTO course_subjects (
         id, tenant_id, course_id, subject_id, pagination_token, default_for_course, sort_order, status, created_at, updated_at
       ) VALUES
         ($1, $4, $2, $3, gen_random_uuid(), true, 1, 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, id) DO NOTHING;`,
      [cs8ALenguaje, course8AId, subLenguaje, tenantId],
    );

    // 8. Teacher: Camila Rojas
    console.log('Seeding teacher: Camila Rojas...');
    const teacherId = '66666666-6666-4666-8666-666666666601';
    await client.query(
      `INSERT INTO teachers (
         id, tenant_id, pagination_token, identity_user_id, source, external_reference,
         first_name, last_name, email, status, created_at, updated_at
       ) VALUES
         ($1, $2, gen_random_uuid(), 'demo-user-teacher', 'MANUAL', 'T-ROJAS-01',
          'Camila', 'Rojas', 'profesor@edupay.local', 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, identity_user_id) DO NOTHING;`,
      [teacherId, tenantId],
    );

    // Assign Camila Rojas to 7º Básico A - Lenguaje
    console.log('Assigning teacher to course subject...');
    await client.query(
      `INSERT INTO course_subject_teachers (
         id, tenant_id, teacher_id, course_subject_id, status, created_at, updated_at
       ) VALUES
         (gen_random_uuid(), $1, $2, $3, 'ACTIVE', now(), now())
       ON CONFLICT DO NOTHING;`,
      [tenantId, teacherId, cs7ALenguaje],
    );

    // 9. Students: Sofía Herrera and Mateo Valenzuela
    console.log('Seeding students: Sofía Herrera and Mateo Valenzuela...');
    const student1Id = '77777777-7777-4777-8777-777777777701';
    const student2Id = '77777777-7777-4777-8777-777777777702';

    await client.query(
      `INSERT INTO students (
         id, tenant_id, pagination_token, identity_user_id, source, external_reference,
         first_name, last_name, email, status, created_at, updated_at
       ) VALUES
         ($1, $3, gen_random_uuid(), 'demo-user-student', 'MANUAL', 'S-HERRERA-01',
          'Sofía', 'Herrera', 'alumno@edupay.local', 'ACTIVE', now(), now()),
         ($2, $3, gen_random_uuid(), 'demo-user-student-2', 'MANUAL', 'S-VALENZUELA-02',
          'Mateo', 'Valenzuela', 'mateo@edupay.local', 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, identity_user_id) DO NOTHING;`,
      [student1Id, student2Id, tenantId],
    );

    // Enroll students in Course 7º Básico A
    console.log('Enrolling students in 7º Básico A...');
    await client.query(
      `INSERT INTO course_enrollments (
         id, tenant_id, student_id, course_id, status, source, external_reference, created_at, updated_at
       ) VALUES
         (gen_random_uuid(), $1, $2, $4, 'ACTIVE', 'MANUAL', 'ENR-HERRERA-7A', now(), now()),
         (gen_random_uuid(), $1, $3, $4, 'ACTIVE', 'MANUAL', 'ENR-VALENZUELA-7A', now(), now())
       ON CONFLICT (tenant_id, source, external_reference) DO NOTHING;`,
      [tenantId, student1Id, student2Id, course7AId],
    );

    // Enroll in 7º Básico A - Lenguaje
    await client.query(
      `INSERT INTO student_subject_enrollments (
         id, tenant_id, student_id, course_subject_id, status, created_at, updated_at
       ) VALUES
         (gen_random_uuid(), $1, $2, $4, 'ACTIVE', now(), now()),
         (gen_random_uuid(), $1, $3, $4, 'ACTIVE', now(), now())
       ON CONFLICT DO NOTHING;`,
      [tenantId, student1Id, student2Id, cs7ALenguaje],
    );

    // 10. Learning Unit & Item in 7º Básico A - Lenguaje
    console.log('Seeding learning unit and items...');
    const unit1Id = '88888888-8888-4888-8888-888888888801';
    await client.query(
      `INSERT INTO learning_units (
         id, tenant_id, course_subject_id, title, description, sort_order, status, created_at, updated_at
       ) VALUES
         ($1, $2, $3, 'Unidad 1: Narrativa y Comprensión Crítica', 'Lectura comprensiva de textos narrativos breves, identificación de personajes, motivos y contexto histórico.', 1, 'ACTIVE', now(), now())
       ON CONFLICT (tenant_id, id, course_subject_id) DO NOTHING;`,
      [unit1Id, tenantId, cs7ALenguaje],
    );

    const itemId = '99999999-9999-4999-8999-999999999901';
    await client.query(
      `INSERT INTO learning_items (
         id, tenant_id, course_subject_id, learning_unit_id, type, title,
         description, instructions, content, sort_order, publication_status,
         publish_at, published_at, published_by_identity_user_id, due_at,
         created_by_identity_user_id, created_at, updated_at
       ) VALUES
         ($1, $2, $3, $4, 'ASSIGNMENT', 'Guía 1: Análisis de Microcuentos Latinoamericanos',
          'Actividad formativa de lectura y análisis literario.',
          'Lee con atención los microcuentos adjuntos y responde las preguntas de interpretación en el espacio de entrega.',
          'Instrucciones generales y preguntas de comprensión crítica.',
          1, 'PUBLISHED', now(), now(), 'demo-user-teacher', now() + interval '14 days',
          'demo-user-teacher', now(), now())
       ON CONFLICT (tenant_id, id) DO NOTHING;`,
      [itemId, tenantId, cs7ALenguaje, unit1Id],
    );

    await client.query('COMMIT');
    console.log('✅ Local development seed completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during seed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();

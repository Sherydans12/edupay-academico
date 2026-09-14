-- Read-only gate for the Academic body-document backfill.
-- Run after pausing the Academic API and workers.
\set ON_ERROR_STOP on

WITH observer AS (
  SELECT pg_backend_pid() AS pid
), active_learning_writers AS (
  SELECT a.pid
  FROM pg_stat_activity AS a
  CROSS JOIN observer AS o
  WHERE a.datname = current_database()
    AND a.pid <> o.pid
    AND a.state <> 'idle'
    AND a.query ~* '(insert|update|delete|merge|copy).*(learning_items|learning_item_drafts|learning_units|content_revisions)'
), open_transactions AS (
  SELECT a.pid
  FROM pg_stat_activity AS a
  CROSS JOIN observer AS o
  WHERE a.datname = current_database()
    AND a.pid <> o.pid
    AND a.xact_start IS NOT NULL
), writer_locks AS (
  SELECT DISTINCT l.pid
  FROM pg_locks AS l
  JOIN pg_class AS c ON c.oid = l.relation
  CROSS JOIN observer AS o
  WHERE l.pid <> o.pid
    AND l.granted
    AND c.relnamespace = 'public'::regnamespace
    AND c.relname IN (
      'learning_items',
      'learning_item_drafts',
      'learning_units',
      'content_revisions'
    )
    AND l.mode IN (
      'RowExclusiveLock',
      'ShareRowExclusiveLock',
      'ShareUpdateExclusiveLock',
      'ExclusiveLock',
      'AccessExclusiveLock'
    )
)
SELECT (SELECT pg_backend_pid()) AS observer_pid,
       (SELECT count(*) FROM active_learning_writers) AS active_learning_writers,
       (SELECT count(*) FROM open_transactions) AS external_open_transactions,
       (SELECT count(*) FROM writer_locks) AS external_writer_lock_holders;

DO $$
DECLARE
  active_writer_count bigint;
  open_transaction_count bigint;
  writer_lock_count bigint;
BEGIN
  SELECT count(*)
  INTO active_writer_count
  FROM pg_stat_activity AS a
  WHERE a.datname = current_database()
    AND a.pid <> pg_backend_pid()
    AND a.state <> 'idle'
    AND a.query ~* '(insert|update|delete|merge|copy).*(learning_items|learning_item_drafts|learning_units|content_revisions)';

  SELECT count(*)
  INTO open_transaction_count
  FROM pg_stat_activity AS a
  WHERE a.datname = current_database()
    AND a.pid <> pg_backend_pid()
    AND a.xact_start IS NOT NULL;

  SELECT count(DISTINCT l.pid)
  INTO writer_lock_count
  FROM pg_locks AS l
  JOIN pg_class AS c ON c.oid = l.relation
  WHERE l.pid <> pg_backend_pid()
    AND l.granted
    AND c.relnamespace = 'public'::regnamespace
    AND c.relname IN (
      'learning_items',
      'learning_item_drafts',
      'learning_units',
      'content_revisions'
    )
    AND l.mode IN (
      'RowExclusiveLock',
      'ShareRowExclusiveLock',
      'ShareUpdateExclusiveLock',
      'ExclusiveLock',
      'AccessExclusiveLock'
    );

  IF active_writer_count <> 0
     OR open_transaction_count <> 0
     OR writer_lock_count <> 0 THEN
    RAISE EXCEPTION 'Learning writes are not quiescent: writers=%, open_transactions=%, writer_lock_holders=%',
      active_writer_count, open_transaction_count, writer_lock_count;
  END IF;
END $$;

SELECT 'LEARNING_WRITE_QUIESCENCE_PASS' AS marker;

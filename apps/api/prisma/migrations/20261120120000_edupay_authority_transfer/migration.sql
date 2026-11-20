-- ADR-0026: the EduPay sync v1 identity stays immutable, with one exception:
-- the authority transfer command may move a record from EDUPAY to MANUAL,
-- keeping its external_reference, inside a transaction that sets
-- edupay.authority_transfer = 'on' (SET LOCAL). Triggers are unchanged.
CREATE OR REPLACE FUNCTION prevent_edupay_external_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."source" = 'EDUPAY'
     AND (NEW."source" IS DISTINCT FROM OLD."source"
       OR NEW."external_reference" IS DISTINCT FROM OLD."external_reference") THEN
    IF NEW."source" = 'MANUAL'
       AND NEW."external_reference" IS NOT DISTINCT FROM OLD."external_reference"
       AND coalesce(current_setting('edupay.authority_transfer', true), '') = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'EDUPAY external identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

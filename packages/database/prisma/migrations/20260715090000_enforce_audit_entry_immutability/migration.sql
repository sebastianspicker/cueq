-- Audit rows are evidence, not mutable application state. Enforce the
-- append-only contract for every PostgreSQL client, including raw SQL.
CREATE OR REPLACE FUNCTION "reject_audit_entry_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries are append-only; % is not permitted', TG_OP
    USING ERRCODE = '55000';
  RETURN NULL;
END;
$$;

CREATE TRIGGER "audit_entries_reject_mutation"
BEFORE UPDATE OR DELETE ON "audit_entries"
FOR EACH ROW
EXECUTE FUNCTION "reject_audit_entry_mutation"();

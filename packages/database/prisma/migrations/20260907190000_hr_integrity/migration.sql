BEGIN;
-- Scope snapshots retain valid organization identities; organizations cannot be removed underneath history.
ALTER TABLE personnel_documents ADD CONSTRAINT "personnel_documents_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES organization_units(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE lifecycle_instances ADD CONSTRAINT "lifecycle_instances_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES organization_units(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE lifecycle_automation_rules ADD CONSTRAINT "lifecycle_automation_rules_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES organization_units(id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Classification changes require a new time type, preserving the meaning of historical attendance.
CREATE FUNCTION cueq_reject_time_type_reclassification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    RAISE EXCEPTION 'Time type category is immutable; create a new time type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER time_type_category_immutable BEFORE UPDATE OF category ON time_types
FOR EACH ROW EXECUTE FUNCTION cueq_reject_time_type_reclassification();
CREATE FUNCTION cueq_reject_lifecycle_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lifecycle_task_history is append-only; % is not permitted', TG_OP USING ERRCODE = '55000';
  RETURN NULL;
END $$;
CREATE TRIGGER lifecycle_history_immutable BEFORE UPDATE OR DELETE ON lifecycle_task_history
FOR EACH ROW EXECUTE FUNCTION cueq_reject_lifecycle_history_mutation();
COMMIT;

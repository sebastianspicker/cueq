BEGIN;

-- CreateTable
CREATE TABLE "task_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_instances" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationUnitId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "baseDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_tasks" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsiblePersonId" TEXT,
    "responsibleGroupId" TEXT,
    "dependsOn" TEXT[] NOT NULL,
    "blocking" BOOLEAN NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_task_history" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_task_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "organizationUnitId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggerDate" DATE,
    "offsetDays" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "authorizedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "messageCode" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_group_members_groupId_createdAt_id_idx" ON "task_group_members"("groupId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "task_group_members_groupId_personId_key" ON "task_group_members"("groupId", "personId");

-- CreateIndex
CREATE INDEX "lifecycle_templates_createdAt_id_idx" ON "lifecycle_templates"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_templates_code_version_key" ON "lifecycle_templates"("code", "version");

-- CreateIndex
CREATE INDEX "lifecycle_instances_assignmentId_createdAt_id_idx" ON "lifecycle_instances"("assignmentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_instances_templateId_assignmentId_eventKey_key" ON "lifecycle_instances"("templateId", "assignmentId", "eventKey");

-- CreateIndex
CREATE INDEX "lifecycle_tasks_responsiblePersonId_createdAt_id_idx" ON "lifecycle_tasks"("responsiblePersonId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "lifecycle_tasks_instanceId_createdAt_id_idx" ON "lifecycle_tasks"("instanceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_tasks_instanceId_key_key" ON "lifecycle_tasks"("instanceId", "key");

-- CreateIndex
CREATE INDEX "lifecycle_task_history_taskId_createdAt_id_idx" ON "lifecycle_task_history"("taskId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "lifecycle_automation_rules_createdAt_id_idx" ON "lifecycle_automation_rules"("createdAt", "id");

-- CreateIndex
CREATE INDEX "inbox_notifications_recipientId_createdAt_id_idx" ON "inbox_notifications"("recipientId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_notifications_recipientId_dedupeKey_key" ON "inbox_notifications"("recipientId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "task_group_members" ADD CONSTRAINT "task_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "task_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_group_members" ADD CONSTRAINT "task_group_members_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_instances" ADD CONSTRAINT "lifecycle_instances_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "lifecycle_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_instances" ADD CONSTRAINT "lifecycle_instances_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "lifecycle_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_responsiblePersonId_fkey" FOREIGN KEY ("responsiblePersonId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_responsibleGroupId_fkey" FOREIGN KEY ("responsibleGroupId") REFERENCES "task_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_task_history" ADD CONSTRAINT "lifecycle_task_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "lifecycle_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_automation_rules" ADD CONSTRAINT "lifecycle_automation_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "lifecycle_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_notifications" ADD CONSTRAINT "inbox_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE lifecycle_templates ADD CONSTRAINT lifecycle_template_kind CHECK (kind IN ('ONBOARDING', 'OFFBOARDING'));
ALTER TABLE lifecycle_templates ADD CONSTRAINT lifecycle_template_status CHECK (status IN ('DRAFT', 'ACTIVE'));
ALTER TABLE lifecycle_templates ADD CONSTRAINT lifecycle_template_version CHECK (version > 0);
ALTER TABLE lifecycle_instances ADD CONSTRAINT lifecycle_instance_status CHECK (status IN ('ACTIVE', 'COMPLETE'));
ALTER TABLE lifecycle_tasks ADD CONSTRAINT lifecycle_task_status CHECK (status IN ('OPEN', 'DONE'));
ALTER TABLE lifecycle_tasks ADD CONSTRAINT lifecycle_task_responsibility CHECK (("responsiblePersonId" IS NULL) <> ("responsibleGroupId" IS NULL));
ALTER TABLE lifecycle_automation_rules ADD CONSTRAINT lifecycle_automation_trigger CHECK (trigger IN ('APPOINTMENT_START', 'APPOINTMENT_END', 'DATE'));
ALTER TABLE lifecycle_automation_rules ADD CONSTRAINT lifecycle_automation_date CHECK ((trigger = 'DATE') = ("triggerDate" IS NOT NULL));
ALTER TABLE lifecycle_automation_rules ADD CONSTRAINT lifecycle_automation_offset CHECK ("offsetDays" BETWEEN -365 AND 365);
ALTER TABLE inbox_notifications ADD CONSTRAINT inbox_resource_type CHECK ("resourceType" IN ('LifecycleTask', 'PersonnelDocument'));
COMMIT;

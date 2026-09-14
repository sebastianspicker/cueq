BEGIN;

-- CreateTable
CREATE TABLE "personnel_documents" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "organizationUnitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "encryptedChecksum" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_acknowledgements" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personnel_documents_personId_createdAt_id_idx" ON "personnel_documents"("personId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "personnel_documents_assignmentId_createdAt_id_idx" ON "personnel_documents"("assignmentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_document_versions_objectKey_key" ON "personnel_document_versions"("objectKey");

-- CreateIndex
CREATE INDEX "personnel_document_versions_documentId_createdAt_id_idx" ON "personnel_document_versions"("documentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_document_versions_documentId_version_key" ON "personnel_document_versions"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "document_acknowledgements_versionId_actorId_key" ON "document_acknowledgements"("versionId", "actorId");

-- AddForeignKey
ALTER TABLE "personnel_documents" ADD CONSTRAINT "personnel_documents_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_document_versions" ADD CONSTRAINT "personnel_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "personnel_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_acknowledgements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "personnel_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE personnel_document_versions ADD CONSTRAINT document_version_positive CHECK (version > 0);
ALTER TABLE personnel_document_versions ADD CONSTRAINT document_size_bound CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760);
ALTER TABLE personnel_document_versions ADD CONSTRAINT document_mime_type CHECK ("mimeType" IN ('application/pdf', 'image/png', 'image/jpeg'));
COMMIT;

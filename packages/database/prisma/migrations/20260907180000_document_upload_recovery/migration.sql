BEGIN;

-- CreateTable
CREATE TABLE "document_uploads" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "cleanupAt" TIMESTAMP(3),

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_uploads_objectKey_key" ON "document_uploads"("objectKey");

-- CreateIndex
CREATE INDEX "document_uploads_status_createdAt_id_idx" ON "document_uploads"("status", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "personnel_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE document_uploads ADD CONSTRAINT document_upload_status CHECK (status IN ('PENDING', 'COMMITTED', 'FAILED'));
COMMIT;

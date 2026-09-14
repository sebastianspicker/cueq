/** Shared bounded-batch primitive for transaction-local HR import writes. */
const HR_IMPORT_WRITE_BATCH_SIZE = 500;

export async function forEachHrImportBatch<T>(
  values: readonly T[],
  operation: (batch: readonly T[]) => Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += HR_IMPORT_WRITE_BATCH_SIZE) {
    await operation(values.slice(offset, offset + HR_IMPORT_WRITE_BATCH_SIZE));
  }
}

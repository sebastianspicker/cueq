/** Maximum rows carried by one parameterized HR import write. */
export const HR_IMPORT_WRITE_BATCH_SIZE = 500;

export async function forEachHrImportBatch(values, operation) {
  for (let offset = 0; offset < values.length; offset += HR_IMPORT_WRITE_BATCH_SIZE) {
    await operation(values.slice(offset, offset + HR_IMPORT_WRITE_BATCH_SIZE));
  }
}

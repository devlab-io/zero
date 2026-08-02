export async function deleteDraftsBatched(
  draftIds: readonly string[],
  deleteDraft: (draftId: string) => Promise<unknown>,
  batchSize = 5,
): Promise<number> {
  const ids = [...new Set(draftIds.filter(Boolean))];
  const safeBatchSize = Math.max(1, Math.floor(batchSize));

  for (let index = 0; index < ids.length; index += safeBatchSize) {
    await Promise.all(ids.slice(index, index + safeBatchSize).map((id) => deleteDraft(id)));
  }

  return ids.length;
}

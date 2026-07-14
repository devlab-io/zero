export type ImportantToggleFeedback = {
  mutate: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
  onSuccess: () => void;
  onError: (error: unknown) => void;
};

/** Keep success and failure feedback coupled to the real mutation result. */
export async function runImportantToggle({
  mutate,
  refresh,
  onSuccess,
  onError,
}: ImportantToggleFeedback): Promise<boolean> {
  try {
    await mutate();
    await refresh();
    onSuccess();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

// Helper function to clean name display. Shared by the Thread and Draft rows so the
// trimming rule lives in exactly one place (no cross-module copy-paste).
export const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  const match = name.match(/^[^\p{L}\p{N}.]*(.*?)[^\p{L}\p{N}.]*$/u);
  return match ? match[1] : name;
};

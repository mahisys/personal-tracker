/** Helpers shared by this module's DB tests. */
export function fd(values: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null) f.set(k, String(v));
  return f;
}

export const sampleItems = JSON.stringify([
  { description: "Website design", hsnSac: "998314", quantity: "1", unitPrice: "50000", gstRate: "18" },
  { description: "Logo", hsnSac: "998391", quantity: "2", unitPrice: "2500", gstRate: "18" },
]);

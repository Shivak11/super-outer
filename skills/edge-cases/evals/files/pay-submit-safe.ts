// Checkout with a request key and a disabled button; covered by pay-submit-safe-check.ts.
export async function onPayPressed(userId: string, planId: string, key: string, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    const res = await fetch("/api/charge", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ userId, planId }) });
    return await res.json();
  } finally {
    setBusy(false);
  }
}

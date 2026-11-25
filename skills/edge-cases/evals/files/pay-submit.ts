// Checkout button handler for the Pro plan.
export async function onPayPressed(userId: string, planId: string) {
  const res = await fetch("/api/charge", {
    method: "POST",
    body: JSON.stringify({ userId, planId }),
  });
  return res.json();
}

// api/charge
export async function charge(req: { userId: string; planId: string }, stripe: any) {
  return stripe.paymentIntents.create({ amount: 49900, currency: "inr", customer: req.userId, confirm: true });
}

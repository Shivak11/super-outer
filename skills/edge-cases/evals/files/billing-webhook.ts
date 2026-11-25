// POST /webhooks/billing from the payment provider.
export async function onBillingEvent(event: { type: string; data: { customer: string; plan: string } }, db: any) {
  if (event.type === "subscription.created") {
    await db.query("insert into subscriptions (customer, plan) values ($1, $2)", [event.data.customer, event.data.plan]);
    await db.query("update users set credits = credits + 100 where customer = $1", [event.data.customer]);
  }
}

import { loadStripe, type Stripe } from "@stripe/stripe-js";

export const createStripePromise = (publishableKey: string): Promise<Stripe | null> | null => {
  if (!publishableKey) {
    return null;
  }

  return loadStripe(publishableKey).catch((error) => {
    console.warn("Failed to load Stripe.js", error);
    return null;
  });
};

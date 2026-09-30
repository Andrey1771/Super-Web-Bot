import { buildStripeElementsOptions } from './stripe-elements-options';

const appearance = { theme: 'stripe' as const };

it('passes the customer session to the card form for a signed-in buyer', () => {
    const options = buildStripeElementsOptions({
        clientSecret: 'pi_1_secret_a',
        customerSessionClientSecret: 'cuss_1_secret_b',
        appearance,
    });

    expect(options.clientSecret).toBe('pi_1_secret_a');
    expect(options.customerSessionClientSecret).toBe('cuss_1_secret_b');
});

it('leaves the customer session out entirely for a guest', () => {
    const options = buildStripeElementsOptions({ clientSecret: 'pi_1_secret_a', customerSessionClientSecret: null, appearance });

    expect(options.clientSecret).toBe('pi_1_secret_a');
    expect('customerSessionClientSecret' in options).toBe(false);
});

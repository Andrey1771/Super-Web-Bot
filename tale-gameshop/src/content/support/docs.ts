export type SupportDocCallout = {
    tone: 'info' | 'warning';
    title?: string;
    text: string;
};

export type SupportDocSection = {
    title: string;
    // Абзац-подводка перед списком (опционально).
    intro?: string;
    bullets: string[];
    // true — нумерованные шаги вместо маркеров.
    ordered?: boolean;
    callout?: SupportDocCallout;
};

export type SupportDoc = {
    id: string;
    // Влияет на бейдж в шапке документа: гайд или правила магазина.
    kind: 'guide' | 'policy';
    title: string;
    route: string;
    shortDescription: string;
    lastUpdated: string;
    intro?: string;
    callout?: SupportDocCallout;
    // Главное действие документа (кнопка в шапке), например форма восстановления доступа.
    action?: { label: string; to: string };
    sections: SupportDocSection[];
};

export const supportDocs: SupportDoc[] = [
    {
        id: 'activation-guide',
        kind: 'guide',
        title: 'Activation guide',
        route: '/support/docs/activation-guide',
        shortDescription: 'Step-by-step activation tips for popular platforms.',
        lastUpdated: 'Last updated: March 4, 2025',
        intro: 'Redeeming a key takes a couple of minutes. Find your platform below and follow the steps — and keep your order number handy in case anything goes wrong.',
        callout: {
            tone: 'info',
            title: 'Keep your key private',
            text: 'Anyone who sees your key can activate it. Never share screenshots of a revealed key — not even with people claiming to be Tale Shop support.'
        },
        sections: [
            {
                title: 'Before you start',
                bullets: [
                    'Make sure the platform account you plan to redeem on is the right one.',
                    'Check the product page for platform and region details.',
                    'Keep your order number handy in case you need help.'
                ]
            },
            {
                title: 'Redeem on Steam',
                ordered: true,
                bullets: [
                    'Open Steam and go to Games → Activate a Product on Steam…',
                    'Enter your key exactly as shown and confirm the activation.',
                    'If you see a region warning, review Regional restrictions before retrying.'
                ]
            },
            {
                title: 'Redeem on other platforms',
                ordered: true,
                bullets: [
                    'Visit the platform’s official redeem page (Epic, EA, Ubisoft, etc.).',
                    'Sign in and enter the key in the redeem or activation field.',
                    'Restart the launcher to see the game in your library.'
                ]
            }
        ]
    },
    {
        id: 'refund-policy',
        kind: 'policy',
        title: 'Refund policy',
        route: '/support/docs/refund-policy',
        shortDescription: 'Understand eligibility and how to request a refund.',
        lastUpdated: 'Last updated: March 1, 2025',
        intro: 'We keep refunds simple: unrevealed keys are usually covered, revealed keys are not — because we can no longer verify they haven’t been activated.',
        sections: [
            {
                title: 'Eligibility basics',
                bullets: [
                    'Unrevealed keys are generally eligible for refunds.',
                    'Revealed or activated keys are typically non-refundable.',
                    'Some products have additional publisher restrictions.'
                ]
            },
            {
                title: 'How to request a refund',
                ordered: true,
                bullets: [
                    'Go to Account → Orders and open the order you want to refund.',
                    'Select Request refund and provide a short reason.',
                    'We will email you once the request is reviewed.'
                ]
            },
            {
                title: 'Processing time',
                bullets: [
                    'Most refunds are reviewed within 24–48 hours.',
                    'Approved refunds are returned to the original payment method.',
                    'Bank processing can take 3–10 business days.'
                ]
            }
        ]
    },
    {
        id: 'payment-methods',
        kind: 'guide',
        title: 'Payment methods',
        route: '/support/docs/payment-methods',
        shortDescription: 'Supported cards, regions, and checkout tips.',
        lastUpdated: 'Last updated: February 22, 2025',
        intro: 'Everything about paying at Tale Shop: what we accept, how to avoid failed payments, and how your card data is protected.',
        sections: [
            {
                title: 'Supported options',
                bullets: [
                    'Major debit and credit cards (Visa, Mastercard, AMEX).',
                    'Select local payment options where available.',
                    'Bank transfers are available for selected regions.'
                ]
            },
            {
                title: 'Checkout tips',
                bullets: [
                    'Match your billing address to your bank records.',
                    'Use a stable connection to avoid timeouts.',
                    'If a payment fails, wait a few minutes before retrying.'
                ]
            },
            {
                title: 'Security',
                bullets: [
                    'Payments are encrypted and processed securely.',
                    'We never store full card numbers on our servers.',
                    'Enable 3D Secure or bank verification when prompted.'
                ]
            }
        ]
    },
    {
        id: 'regional-restrictions',
        kind: 'policy',
        title: 'Regional restrictions',
        route: '/support/docs/regional-restrictions',
        shortDescription: 'Know where a key can be activated and used.',
        lastUpdated: 'Last updated: February 10, 2025',
        intro: 'Publishers can lock keys to specific regions. A minute of checking before purchase saves a support ticket after.',
        sections: [
            {
                title: 'Why restrictions exist',
                bullets: [
                    'Publishers may limit keys to specific regions.',
                    'Pricing and licensing rules differ by country.',
                    'We display region details on every product page.'
                ]
            },
            {
                title: 'How to check your region',
                bullets: [
                    'Compare the product region with your account country.',
                    'Check the platform store region before redeeming.',
                    'If unsure, contact support before revealing the key.'
                ]
            },
            {
                title: 'If you see an error',
                bullets: [
                    'Do not keep retrying—errors can lock the key temporarily.',
                    'Take a screenshot of the error message for support.',
                    'We can verify the region and advise next steps.'
                ]
            }
        ]
    },
    {
        id: 'account-recovery',
        kind: 'guide',
        title: 'Account recovery & 2FA',
        route: '/support/docs/account-recovery',
        shortDescription: 'What to do if you lose access to your authenticator or backup codes.',
        lastUpdated: 'Last updated: July 6, 2026',
        intro: 'Lost your phone with the authenticator app? Ran out of backup codes? Don’t panic — go through the self-service options first, then request a manual recovery if nothing works.',
        callout: {
            tone: 'warning',
            title: 'How we protect recovery',
            text: 'Support will never disable two-factor authentication instantly. Every recovery request is identity-checked and deliberately delayed — this is exactly what stops attackers from stealing accounts by impersonating their owners.'
        },
        action: { label: 'Open recovery form', to: '/account-recovery' },
        sections: [
            {
                title: 'Try these first',
                intro: 'Most lockouts are solved in a minute without contacting support:',
                bullets: [
                    'Use a backup code: on the sign-in page enter your password, choose “Try another way” and pick “Recovery authentication codes”. Each code works once.',
                    'Still signed in on another device or browser? Open Account → Security there and re-configure two-factor authentication.',
                    'Replaced your phone? Restoring the authenticator app from its own backup (e.g. Google Authenticator account sync) usually brings your codes back.'
                ]
            },
            {
                title: 'Request account recovery',
                intro: 'If none of the above works, ask us to reset your second factor:',
                ordered: true,
                bullets: [
                    'Fill in the recovery form (button above) — it works without signing in.',
                    'Provide your account email, one or two recent order numbers and the last 4 digits of the card you paid with.',
                    'We verify ownership against your order and payment history, so expect follow-up questions.',
                    'Recovery includes a waiting period of up to 72 hours. We notify your account email at every step, and you can cancel the request from any active session.',
                    'Once verified, we reset your second factor. On the next sign-in you will set a new password and re-enable 2FA.'
                ]
            },
            {
                title: 'What we will — and won’t — ask for',
                bullets: [
                    'We may ask for: your account email, recent order IDs, the last 4 digits and exact amounts of recent payments.',
                    'We will never ask for your password, a full card number, or codes from your authenticator app.',
                    'If anyone claiming to be Tale Shop asks for those, it is a scam — please report it to us.'
                ],
                callout: {
                    tone: 'info',
                    text: 'Recovery requests are only discussed via the email addresses involved in the request. We never process them in live chat or social media.'
                }
            },
            {
                title: 'Avoid getting locked out again',
                bullets: [
                    'Generate a fresh set of backup codes and store them offline — print them or keep them in a password manager.',
                    'Keep a second trusted device signed in to your account.',
                    'Keep your account email verified and up to date — it is the channel we use to confirm recovery.'
                ]
            }
        ]
    }
];

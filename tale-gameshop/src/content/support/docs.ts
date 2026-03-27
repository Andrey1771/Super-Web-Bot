export type SupportDocSection = {
    title: string;
    bullets: string[];
};

export type SupportDoc = {
    id: string;
    title: string;
    route: string;
    shortDescription: string;
    lastUpdated: string;
    sections: SupportDocSection[];
};

export const supportDocs: SupportDoc[] = [
    {
        id: 'activation-guide',
        title: 'Activation guide',
        route: '/support/docs/activation-guide',
        shortDescription: 'Step-by-step activation tips for popular platforms.',
        lastUpdated: 'Last updated: March 4, 2025',
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
                bullets: [
                    'Open Steam and go to Games → Activate a Product on Steam…',
                    'Enter your key exactly as shown and confirm the activation.',
                    'If you see a region warning, review Regional restrictions.'
                ]
            },
            {
                title: 'Redeem on other platforms',
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
        title: 'Refund policy',
        route: '/support/docs/refund-policy',
        shortDescription: 'Understand eligibility and how to request a refund.',
        lastUpdated: 'Last updated: March 1, 2025',
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
        title: 'Payment methods',
        route: '/support/docs/payment-methods',
        shortDescription: 'Supported cards, regions, and checkout tips.',
        lastUpdated: 'Last updated: February 22, 2025',
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
        title: 'Regional restrictions',
        route: '/support/docs/regional-restrictions',
        shortDescription: 'Know where a key can be activated and used.',
        lastUpdated: 'Last updated: February 10, 2025',
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
    }
];

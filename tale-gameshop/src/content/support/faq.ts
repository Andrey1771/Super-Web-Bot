export type FaqItem = {
    id: string;
    question: string;
    answer: string;
};

export const faqItems: FaqItem[] = [
    {
        id: 'where-is-my-game-key',
        question: 'Where is my game key?',
        answer:
            'Keys are delivered instantly after successful payment. If your bank is reviewing the payment, delivery may take a bit longer. If it’s been over 30 minutes, refresh your Orders page and check the order status. Still missing? Contact support with your order number.'
    },
    {
        id: 'how-do-refunds-work',
        question: 'How do refunds work?',
        answer:
            'Refund eligibility depends on the product and whether the key was revealed or activated. If a key wasn’t revealed, a refund is usually possible under our policy. If a key was revealed or used, refunds are typically not available. See Refund policy for details.'
    },
    {
        id: 'payment-charged-order-missing',
        question: 'Payment was charged but order is missing',
        answer:
            'Some payments appear as “pending” or authorization before the order is created. Wait 10–30 minutes and refresh your Orders page. Also check you’re logged into the correct account/email. If it still doesn’t show up, contact support with the payment receipt/transaction ID.'
    },
    {
        id: 'download-invoice',
        question: 'How to download an invoice?',
        answer:
            'Go to Account → Orders → select your order → Download invoice (PDF). If the invoice button isn’t available yet, the order may still be processing. If you need it urgently, contact support and we’ll help.'
    },
    {
        id: 'activate-steam-key',
        question: 'How to activate a Steam key?',
        answer:
            'Open Steam → Games → Activate a Product on Steam… → enter your key → confirm. If you see a region or “invalid” error, check Regional restrictions or make sure you’re redeeming on the correct platform.'
    },
    {
        id: 'secure-account',
        question: 'How to secure my account?',
        answer:
            'Use a strong, unique password and don’t reuse it elsewhere. Enable 2FA if available and never share your keys or password. If you suspect suspicious activity, change your password immediately and contact support.'
    }
];

export type AccountSession = {
    id: string;
    ipAddress: string;
    start: number;
    lastAccess: number;
    device: string;
};

export type AccountSecurityStatus = {
    email: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    backupCodesGenerated: boolean;
    passwordUpdatedAt?: string | null;
    accountConsoleUrl?: string | null;
    sessions: AccountSession[];
};

export type SecurityActionResponse = {
    mode: string;
    message: string;
    redirectUrl?: string | null;
};

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
    backupCodesGenerated?: boolean | null;
    passwordUpdatedAt?: string | null;
    keycloakAdminConfigured: boolean;
    accountConsoleUrl?: string | null;
    capabilities: AccountSecurityCapabilities;
    unavailableReasons: Record<string, string>;
    sessions: AccountSession[];
};

export type AccountSecurityCapabilities = {
    canManageTwoFactor: boolean;
    canChangePasswordInline: boolean;
    canSendPasswordResetEmail: boolean;
    canManageSessions: boolean;
    canChangeEmail: boolean;
    canDeactivateAccount: boolean;
};

export type SecurityActionResponse = {
    mode: string;
    message: string;
    redirectUrl?: string | null;
};

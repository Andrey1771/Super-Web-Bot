export type AccountSecurityProfile = {
    displayName: string;
    email: string;
    emailVerified: boolean;
    memberSince: string;
    isTwoFactorEnabled: boolean;
    lastPasswordChangeAt?: string | null;
    backupCodesGeneratedAt?: string | null;
    hasBackupCodes?: boolean;
};

export type TwoFactorSetup = {
    otpauthUri: string;
    qrPngBase64: string;
    manualKey: string;
};

export type TwoFactorEnableResponse = {
    backupCodes: string[];
};

export type AccountSession = {
    id: string;
    deviceName: string;
    ipAddress: string;
    location: string;
    lastSeenAt: string;
};

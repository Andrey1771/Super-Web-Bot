export type AccountProfile = {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type AvatarResponse = {
  avatarUrl?: string | null;
};

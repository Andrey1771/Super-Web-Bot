import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { AccountProfile, AvatarResponse } from "../types/account-profile";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const fetchAccountProfile = async (): Promise<AccountProfile> => {
  const response = await apiClient().get("/api/account/me");
  return response.data as AccountProfile;
};

export const uploadAvatar = async (
  file: File,
  onProgress?: (value: number) => void
): Promise<AvatarResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient().post("/api/account/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (!event.total) {
        return;
      }
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    },
  });
  return response.data as AvatarResponse;
};

export const deleteAvatar = async (): Promise<AvatarResponse> => {
  const response = await apiClient().delete("/api/account/avatar");
  return response.data as AvatarResponse;
};

import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { AccountProfile, AvatarResponse } from "../types/account-profile";
import type { AccountOrderDetails, AccountOrdersResponse, FetchAccountOrdersParams } from "../types/account-orders";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const fetchAccountProfile = async (): Promise<AccountProfile> => {
  const response = await apiClient().get("/api/account/me");
  return response.data as AccountProfile;
};

export type SaveAccountProfilePayload = {
  displayName?: string;
  email?: string;
  avatar?: File | null;
  removeAvatar?: boolean;
};

export const saveAccountProfile = async (payload: SaveAccountProfilePayload): Promise<AccountProfile> => {
  const formData = new FormData();
  if (typeof payload.displayName === "string") {
    formData.append("displayName", payload.displayName);
  }
  if (typeof payload.email === "string") {
    formData.append("email", payload.email);
  }
  if (payload.avatar) {
    formData.append("avatar", payload.avatar);
  }
  if (payload.removeAvatar) {
    formData.append("removeAvatar", "true");
  }

  const response = await apiClient().patch("/api/account/profile", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data as AccountProfile;
};

export const deleteAvatar = async (): Promise<AvatarResponse> => {
  const response = await apiClient().delete("/api/account/avatar");
  return response.data as AvatarResponse;
};

export const fetchAccountOrders = async (params: FetchAccountOrdersParams): Promise<AccountOrdersResponse> => {
  const response = await apiClient().get("/api/account/orders", {
    params: {
      page: params.page,
      pageSize: params.pageSize,
      status: params.status,
      q: params.q,
      sort: params.sort,
    },
  });

  return response.data as AccountOrdersResponse;
};


export const fetchAccountOrderDetails = async (orderId: string): Promise<AccountOrderDetails> => {
  const response = await apiClient().get(`/api/account/orders/${orderId}`);
  return response.data as AccountOrderDetails;
};

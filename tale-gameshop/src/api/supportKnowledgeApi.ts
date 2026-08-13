import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { SupportKnowledgeArticle } from "../types/support-knowledge";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const listKnowledgeArticles = async (): Promise<SupportKnowledgeArticle[]> => {
  const response = await apiClient().get("/api/support/admin/knowledge");
  return Array.isArray(response.data) ? response.data : [];
};

export const createKnowledgeArticle = async (
  article: SupportKnowledgeArticle
): Promise<SupportKnowledgeArticle> => {
  const response = await apiClient().post("/api/support/admin/knowledge", article);
  return response.data;
};

export const updateKnowledgeArticle = async (
  id: string,
  article: SupportKnowledgeArticle
): Promise<SupportKnowledgeArticle> => {
  const response = await apiClient().put(`/api/support/admin/knowledge/${id}`, article);
  return response.data;
};

export const deleteKnowledgeArticle = async (id: string): Promise<void> => {
  await apiClient().delete(`/api/support/admin/knowledge/${id}`);
};

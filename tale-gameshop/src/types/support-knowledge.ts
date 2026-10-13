export type SupportKnowledgeArticle = {
  id?: string;
  slug?: string;
  title: string;
  category?: string;
  keywords?: string[];
  content: string;
  enabled: boolean;
  sortOrder: number;
  // Готовый ответ без обращения к модели — необязательная часть темы.
  instantEnabled: boolean;
  instantTriggers?: string[][];
  instantTextRu?: string;
  instantTextEn?: string;
  instantTextUk?: string;
  instantTextPl?: string;
  updatedAt?: string;
  updatedBy?: string;
};

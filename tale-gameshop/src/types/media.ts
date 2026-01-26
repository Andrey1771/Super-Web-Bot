export interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  createdAt: string;
  tags?: string[] | null;
}

export interface MediaUsage {
  gameId: string;
  gameTitle: string;
}

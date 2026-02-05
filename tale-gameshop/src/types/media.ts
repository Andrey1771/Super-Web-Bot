export interface MediaAsset {
  id: string;
  type?: "image" | "video";
  url: string;
  thumbnailUrl?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  createdAt: string;
  tags?: string[] | null;
}

export interface MediaUsage {
  gameId: string;
  gameTitle: string;
}

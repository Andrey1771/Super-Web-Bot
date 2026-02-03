import React, { useEffect, useMemo, useState } from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { IAdminGameDetailsService } from "../../iterfaces/i-admin-game-details-service";
import type { Game } from "../../models/game";
import type { GameDetails, MediaItem } from "../../types/game-details";
import MediaPickerModal from "../../components/admin-panel/media-library/MediaPickerModal";
import { useToast } from "../../components/ui/ToastProvider";

const emptyDetails = (gameId: string, slug: string, title: string): GameDetails => ({
  gameId,
  slug,
  title,
  tagline: "",
  descriptionMarkdown: "",
  cover: undefined,
  gallery: [],
  genres: [],
  tags: [],
  developer: { name: "" },
  publisher: { name: "" },
  releaseDate: undefined,
  platforms: { windows: true, mac: false, linux: false },
  languages: { audio: [], text: [] },
  ageRating: { system: "", label: "" },
  onlineFeatures: [],
  controllerSupport: "Full",
  cloudSavesSupported: false,
  basePrice: 0,
  discountPercent: undefined,
  currency: "USD",
  finalPrice: 0,
  isActive: true,
  isNew: false,
  isTopRated: false,
  keyType: "SteamKey",
  keyFeatures: [],
  awards: [],
  editions: [],
  dlcItems: [],
  systemRequirements: {
    windows: {
      minimum: { os: "", cpu: "", ram: "", gpu: "", storage: "" }
    }
  },
  similarGameIds: [],
  autoRecommendRules: { enabled: false, byGenres: true, byTags: true, byPublisher: true },
  ratingAvg: 0,
  reviewsCount: 0
});

const GameDetailsEditorPage: React.FC = () => {
  const gameService = useMemo(() => container.get<IGameService>(IDENTIFIERS.IGameService), []);
  const adminService = useMemo(() => container.get<IAdminGameDetailsService>(IDENTIFIERS.IAdminGameDetailsService), []);
  const { addToast } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  useEffect(() => {
    const fetchGames = async () => {
      const list = await gameService.getAllGames();
      setGames(list);
      if (list.length > 0) {
        setSelectedGameId(list[0].id ?? "");
      }
    };
    fetchGames();
  }, [gameService]);

  useEffect(() => {
    if (!selectedGameId) return;
    const loadDetails = async () => {
      try {
        setLoading(true);
        const response = await adminService.getGameDetails(selectedGameId);
        setDetails(response);
      } catch (error) {
        console.error(error);
        const game = games.find((item) => item.id === selectedGameId);
        if (game?.id) {
          setDetails(emptyDetails(game.id, game.title, game.title));
        }
      } finally {
        setLoading(false);
      }
    };
    loadDetails();
  }, [adminService, games, selectedGameId]);

  const updateDetails = (patch: Partial<GameDetails>) => {
    setDetails((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!details) return;
    try {
      const updated = await adminService.updateDetails(details.gameId, details);
      setDetails(updated);
      addToast("Game details saved.", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to save game details.", "error");
    }
  };

  const updateListField = (field: keyof GameDetails, value: string) => {
    updateDetails({ [field]: value.split("\n").map((item) => item.trim()).filter(Boolean) } as Partial<GameDetails>);
  };

  const updateGalleryItem = (index: number, patch: Partial<MediaItem>) => {
    if (!details) return;
    const next = [...details.gallery];
    next[index] = { ...next[index], ...patch };
    updateDetails({ gallery: next });
  };

  const addGalleryItem = () => {
    if (!details) return;
    updateDetails({
      gallery: [
        ...details.gallery,
        {
          id: `media-${Date.now()}`,
          type: "image",
          url: "",
          thumbUrl: "",
          posterUrl: "",
          durationSec: undefined,
          order: details.gallery.length + 1
        }
      ]
    });
  };

  const updateEdition = (index: number, patch: Partial<GameDetails["editions"][number]>) => {
    if (!details) return;
    const next = [...details.editions];
    next[index] = { ...next[index], ...patch };
    updateDetails({ editions: next });
  };

  const addEdition = () => {
    if (!details) return;
    updateDetails({
      editions: [
        ...details.editions,
        {
          code: `edition-${Date.now()}`,
          title: "New edition",
          description: "",
          price: 0,
          discountPercent: undefined,
          includedItems: [],
          isDefault: details.editions.length === 0
        }
      ]
    });
  };

  const updateDlc = (index: number, patch: Partial<GameDetails["dlcItems"][number]>) => {
    if (!details) return;
    const next = [...details.dlcItems];
    next[index] = { ...next[index], ...patch };
    updateDetails({ dlcItems: next });
  };

  const addDlc = () => {
    if (!details) return;
    updateDetails({
      dlcItems: [
        ...details.dlcItems,
        {
          id: `dlc-${Date.now()}`,
          title: "New DLC",
          coverUrl: "",
          price: 0,
          discountPercent: undefined,
          isBundle: false
        }
      ]
    });
  };

  if (!details) {
    return (
      <div className="admin-card">
        <p>{loading ? "Loading..." : "Select a game"}</p>
      </div>
    );
  }

  return (
    <div className="admin-grid">
      <div className="admin-card">
        <h2>Game details editor</h2>
        <div className="admin-grid admin-grid--2">
          <label>
            Game
            <select
              className="input"
              value={selectedGameId}
              onChange={(event) => setSelectedGameId(event.target.value)}
            >
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Slug
            <input
              className="input"
              value={details.slug}
              onChange={(event) => updateDetails({ slug: event.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>General</h3>
        <div className="admin-grid admin-grid--2">
          <label>
            Title
            <input className="input" value={details.title} onChange={(event) => updateDetails({ title: event.target.value })} />
          </label>
          <label>
            Tagline
            <input className="input" value={details.tagline} onChange={(event) => updateDetails({ tagline: event.target.value })} />
          </label>
        </div>
        <label>
          Description (markdown)
          <textarea
            className="input"
            rows={6}
            value={details.descriptionMarkdown}
            onChange={(event) => updateDetails({ descriptionMarkdown: event.target.value })}
          />
        </label>
        <div className="admin-grid admin-grid--3">
          <label>
            Genres (one per line)
            <textarea className="input" rows={4} value={details.genres.join("\n")} onChange={(event) => updateListField("genres", event.target.value)} />
          </label>
          <label>
            Tags (one per line)
            <textarea className="input" rows={4} value={details.tags.join("\n")} onChange={(event) => updateListField("tags", event.target.value)} />
          </label>
          <label>
            Key features (one per line)
            <textarea className="input" rows={4} value={details.keyFeatures.join("\n")} onChange={(event) => updateListField("keyFeatures", event.target.value)} />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Media</h3>
        <button className="btn btn-outline" onClick={() => setMediaPickerOpen(true)}>Select cover</button>
        {details.cover?.url && <img src={details.cover.url} alt="Cover" className="mt-2 rounded-lg" />}
        <div className="admin-table__cell-muted mt-4">Gallery</div>
        <div className="admin-grid">
          {details.gallery.map((item, index) => (
            <div key={item.id} className="admin-grid admin-grid--3">
              <input className="input" value={item.type} onChange={(event) => updateGalleryItem(index, { type: event.target.value as MediaItem["type"] })} />
              <input className="input" placeholder="URL" value={item.url} onChange={(event) => updateGalleryItem(index, { url: event.target.value })} />
              <input className="input" placeholder="Thumb URL" value={item.thumbUrl} onChange={(event) => updateGalleryItem(index, { thumbUrl: event.target.value })} />
            </div>
          ))}
        </div>
        <button className="btn btn-outline" onClick={addGalleryItem}>Add media</button>
      </div>

      <div className="admin-card">
        <h3>Pricing</h3>
        <div className="admin-grid admin-grid--3">
          <label>
            Base price
            <input className="input" type="number" value={details.basePrice} onChange={(event) => updateDetails({ basePrice: Number(event.target.value) })} />
          </label>
          <label>
            Discount %
            <input className="input" type="number" value={details.discountPercent ?? ""} onChange={(event) => updateDetails({ discountPercent: Number(event.target.value) || undefined })} />
          </label>
          <label>
            Currency
            <input className="input" value={details.currency} onChange={(event) => updateDetails({ currency: event.target.value })} />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Editions</h3>
        {details.editions.map((edition, index) => (
          <div key={edition.code} className="admin-grid admin-grid--3">
            <input className="input" value={edition.title} onChange={(event) => updateEdition(index, { title: event.target.value })} />
            <input className="input" value={edition.description} onChange={(event) => updateEdition(index, { description: event.target.value })} />
            <input className="input" type="number" value={edition.price} onChange={(event) => updateEdition(index, { price: Number(event.target.value) })} />
          </div>
        ))}
        <button className="btn btn-outline" onClick={addEdition}>Add edition</button>
      </div>

      <div className="admin-card">
        <h3>DLC & bundles</h3>
        {details.dlcItems.map((dlc, index) => (
          <div key={dlc.id} className="admin-grid admin-grid--3">
            <input className="input" value={dlc.title} onChange={(event) => updateDlc(index, { title: event.target.value })} />
            <input className="input" value={dlc.coverUrl} onChange={(event) => updateDlc(index, { coverUrl: event.target.value })} />
            <input className="input" type="number" value={dlc.price} onChange={(event) => updateDlc(index, { price: Number(event.target.value) })} />
          </div>
        ))}
        <button className="btn btn-outline" onClick={addDlc}>Add DLC</button>
      </div>

      <div className="admin-card">
        <h3>System requirements (Windows)</h3>
        <div className="admin-grid admin-grid--2">
          <input className="input" placeholder="OS" value={details.systemRequirements.windows.minimum.os ?? ""} onChange={(event) => updateDetails({ systemRequirements: { ...details.systemRequirements, windows: { ...details.systemRequirements.windows, minimum: { ...details.systemRequirements.windows.minimum, os: event.target.value } } } })} />
          <input className="input" placeholder="CPU" value={details.systemRequirements.windows.minimum.cpu ?? ""} onChange={(event) => updateDetails({ systemRequirements: { ...details.systemRequirements, windows: { ...details.systemRequirements.windows, minimum: { ...details.systemRequirements.windows.minimum, cpu: event.target.value } } } })} />
          <input className="input" placeholder="RAM" value={details.systemRequirements.windows.minimum.ram ?? ""} onChange={(event) => updateDetails({ systemRequirements: { ...details.systemRequirements, windows: { ...details.systemRequirements.windows, minimum: { ...details.systemRequirements.windows.minimum, ram: event.target.value } } } })} />
          <input className="input" placeholder="GPU" value={details.systemRequirements.windows.minimum.gpu ?? ""} onChange={(event) => updateDetails({ systemRequirements: { ...details.systemRequirements, windows: { ...details.systemRequirements.windows, minimum: { ...details.systemRequirements.windows.minimum, gpu: event.target.value } } } })} />
          <input className="input" placeholder="Storage" value={details.systemRequirements.windows.minimum.storage ?? ""} onChange={(event) => updateDetails({ systemRequirements: { ...details.systemRequirements, windows: { ...details.systemRequirements.windows, minimum: { ...details.systemRequirements.windows.minimum, storage: event.target.value } } } })} />
        </div>
      </div>

      <div className="admin-card">
        <h3>Awards</h3>
        <textarea className="input" rows={4} value={details.awards.map((award) => award.title).join("\n")} onChange={(event) => updateDetails({ awards: event.target.value.split("\n").map((title) => ({ title })) })} />
      </div>

      <div className="admin-card">
        <h3>Recommendations</h3>
        <label>
          Similar Game IDs (comma separated)
          <input className="input" value={details.similarGameIds.join(",")} onChange={(event) => updateDetails({ similarGameIds: event.target.value.split(",").map((id) => id.trim()).filter(Boolean) })} />
        </label>
        <div className="admin-grid admin-grid--3">
          <label>
            Auto (genres)
            <input type="checkbox" checked={details.autoRecommendRules.byGenres} onChange={(event) => updateDetails({ autoRecommendRules: { ...details.autoRecommendRules, byGenres: event.target.checked } })} />
          </label>
          <label>
            Auto (tags)
            <input type="checkbox" checked={details.autoRecommendRules.byTags} onChange={(event) => updateDetails({ autoRecommendRules: { ...details.autoRecommendRules, byTags: event.target.checked } })} />
          </label>
          <label>
            Auto (publisher)
            <input type="checkbox" checked={details.autoRecommendRules.byPublisher} onChange={(event) => updateDetails({ autoRecommendRules: { ...details.autoRecommendRules, byPublisher: event.target.checked } })} />
          </label>
        </div>
      </div>

      <div className="admin-drawer__footer">
        <button className="btn btn-primary" onClick={handleSave}>Save all</button>
      </div>

      <MediaPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(asset) => updateDetails({ cover: { url: asset.url, alt: asset.filename } })}
      />
    </div>
  );
};

export default GameDetailsEditorPage;

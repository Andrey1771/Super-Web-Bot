import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { IAdminGameDetailsService } from "../../iterfaces/i-admin-game-details-service";
import type { Game } from "../../models/game";
import type { AdminGameDiscount, GameDetails, MediaItem } from "../../types/game-details";
import MediaPickerModal from "../../components/admin-panel/media-library/MediaPickerModal";
import { useToast } from "../../components/ui/ToastProvider";
import KeyInventorySection from "../../components/admin/KeyInventorySection";

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
  showInFeaturedStorefront: false,
  featuredStorefrontPriority: 0,
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
  const location = useLocation();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerMode, setMediaPickerMode] = useState<"cover" | "gallery">("cover");
  const [discount, setDiscount] = useState<AdminGameDiscount>({ gameId: "", isActive: false });

  useEffect(() => {
    const fetchGames = async () => {
      const list = await gameService.getAllGames();
      setGames(list);
      if (list.length > 0) {
        const params = new URLSearchParams(location.search);
        const requestedId = params.get("gameId");
        const matched = requestedId ? list.find((item) => item.id === requestedId) : null;
        setSelectedGameId(matched?.id ?? list[0].id ?? "");
      }
    };
    fetchGames();
  }, [gameService, location.search]);

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

  useEffect(() => {
    if (!selectedGameId) return;
    const loadDiscount = async () => {
      try {
        const response = await adminService.getDiscount(selectedGameId);
        setDiscount(response);
      } catch (error) {
        console.error(error);
        setDiscount({ gameId: selectedGameId, isActive: false });
      }
    };

    loadDiscount();
  }, [adminService, selectedGameId]);


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

  const addGalleryAssets = (assets: Array<{ id: string; url: string; thumbnailUrl?: string | null; type?: "image" | "video"; durationSec?: number | null }>) => {
    if (!details) return;
    const existingIds = new Set(details.gallery.map((item) => item.id));
    const newItems: MediaItem[] = assets
      .filter((asset) => !existingIds.has(asset.id))
      .map((asset, index) => ({
        id: asset.id,
        type: asset.type ?? "image",
        url: asset.url,
        thumbUrl: asset.thumbnailUrl ?? asset.url,
        posterUrl: asset.thumbnailUrl ?? asset.url,
        durationSec: asset.durationSec ?? undefined,
        order: details.gallery.length + index + 1
      }));
    updateDetails({ gallery: [...details.gallery, ...newItems] });
  };

  const setTrailer = (id: string) => {
    if (!details) return;
    updateDetails({
      gallery: details.gallery.map((item) => ({ ...item, isTrailer: item.id === id }))
    });
  };

  const moveGalleryItem = (index: number, direction: -1 | 1) => {
    if (!details) return;
    const next = [...details.gallery];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= next.length) return;
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    updateDetails({ gallery: next.map((item, idx) => ({ ...item, order: idx + 1 })) });
  };

  const removeGalleryItem = (id: string) => {
    if (!details) return;
    updateDetails({ gallery: details.gallery.filter((item) => item.id !== id) });
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



  const handleSaveDiscount = async () => {
    if (!selectedGameId || !discount.discountPercent || !discount.startDate || !discount.endDate) {
      addToast("Fill discount percent and dates.", "error");
      return;
    }

    try {
      const saved = await adminService.upsertDiscount(selectedGameId, {
        discountPercent: Number(discount.discountPercent),
        startDate: discount.startDate,
        endDate: discount.endDate
      });
      setDiscount(saved);
      addToast("Discount saved.", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to save discount.", "error");
    }
  };

  const handleDeleteDiscount = async () => {
    if (!selectedGameId) return;
    try {
      await adminService.deleteDiscount(selectedGameId);
      setDiscount({ gameId: selectedGameId, isActive: false });
      addToast("Discount removed.", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to remove discount.", "error");
    }
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

      {selectedGameId && <KeyInventorySection gameId={selectedGameId} />}

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
        <p className="text-sm text-gray-500">Upload images or videos, arrange the gallery, and mark a trailer.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-outline"
            onClick={() => {
              setMediaPickerMode("cover");
              setMediaPickerOpen(true);
            }}
          >
            Choose cover
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              setMediaPickerMode("gallery");
              setMediaPickerOpen(true);
            }}
          >
            Add media
          </button>
        </div>
        {details.cover?.url ? (
          <div className="mt-4 flex items-center gap-3">
            <img src={details.cover.url} alt={details.cover.alt ?? "Cover"} className="h-24 w-20 rounded object-cover" />
            <div>
              <p className="text-sm font-semibold">Cover image</p>
              <button className="btn btn-outline btn-small" onClick={() => updateDetails({ cover: undefined })}>
                Remove cover
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No cover selected.</p>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {details.gallery.length === 0 ? (
            <p className="text-sm text-gray-500">Gallery is empty.</p>
          ) : (
            details.gallery.map((item, index) => (
              <div key={item.id} className="border rounded-lg p-3 flex gap-3">
                <div className="h-20 w-28 overflow-hidden rounded bg-gray-100">
                  {item.type === "video" ? (
                    item.thumbUrl ? (
                      <img src={item.thumbUrl} alt={item.title ?? "Video"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">▶ Video</div>
                    )
                  ) : (
                    <img src={item.url} alt={item.title ?? "Image"} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-gray-500">{item.type}</span>
                    {item.type === "video" && (
                      <button
                        className={`btn btn-small ${item.isTrailer ? "btn-primary" : "btn-outline"}`}
                        onClick={() => setTrailer(item.id)}
                      >
                        {item.isTrailer ? "Trailer" : "Set trailer"}
                      </button>
                    )}
                  </div>
                  <input
                    className="input"
                    placeholder="Caption"
                    value={item.caption ?? ""}
                    onChange={(event) => updateGalleryItem(index, { caption: event.target.value })}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-outline btn-small" onClick={() => moveGalleryItem(index, -1)}>↑</button>
                    <button className="btn btn-outline btn-small" onClick={() => moveGalleryItem(index, 1)}>↓</button>
                    <button className="btn btn-outline btn-small" onClick={() => removeGalleryItem(item.id)}>Remove</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>Pricing</h3>
        <div className="admin-grid admin-grid--3">
          <label>
            Base price
            <input className="input" type="number" value={details.basePrice} onChange={(event) => updateDetails({ basePrice: Number(event.target.value) })} />
          </label>
          <label>
            Currency
            <input className="input" value={details.currency} onChange={(event) => updateDetails({ currency: event.target.value })} />
          </label>
          <label>
            Current final price
            <input className="input" type="number" value={details.finalPrice} onChange={(event) => updateDetails({ finalPrice: Number(event.target.value) })} />
          </label>
        </div>

        <div className="admin-grid admin-grid--4" style={{ marginTop: 12 }}>
          <label>
            Discount %
            <input className="input" type="number" value={discount.discountPercent ?? ""} onChange={(event) => setDiscount((prev) => ({ ...prev, gameId: selectedGameId, discountPercent: Number(event.target.value) || undefined }))} />
          </label>
          <label>
            Start date
            <input className="input" type="datetime-local" value={discount.startDate ? discount.startDate.slice(0, 16) : ""} onChange={(event) => setDiscount((prev) => ({ ...prev, gameId: selectedGameId, startDate: event.target.value }))} />
          </label>
          <label>
            End date
            <input className="input" type="datetime-local" value={discount.endDate ? discount.endDate.slice(0, 16) : ""} onChange={(event) => setDiscount((prev) => ({ ...prev, gameId: selectedGameId, endDate: event.target.value }))} />
          </label>
          <label>
            Active now
            <input className="input" value={discount.isActive ? "Yes" : "No"} readOnly />
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="btn btn-outline" onClick={handleSaveDiscount}>Save discount</button>
          <button className="btn btn-outline" onClick={handleDeleteDiscount}>Delete discount</button>
        </div>
      </div>

      <div className="admin-card">
        <h3>Featured storefront settings</h3>
        <div className="admin-grid admin-grid--3">
          <label>
            Show in homepage Featured / Top Picks
            <select
              className="input"
              value={details.showInFeaturedStorefront ? "yes" : "no"}
              onChange={(event) => updateDetails({ showInFeaturedStorefront: event.target.value === "yes" })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Top Picks priority (lower first)
            <input
              className="input"
              type="number"
              value={details.featuredStorefrontPriority}
              onChange={(event) => updateDetails({ featuredStorefrontPriority: Number(event.target.value) || 0 })}
            />
          </label>
          <label>
            Genres shown in storefront
            <input
              className="input"
              value={details.genres.join(", ")}
              readOnly
            />
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

      <div className="admin-save-bar">
        <button className="btn btn-primary" onClick={handleSave}>Save all</button>
      </div>

      <MediaPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        filterType={mediaPickerMode === "cover" ? "image" : "all"}
        allowMultiple={mediaPickerMode === "gallery"}
        onSelect={(asset) => {
          if (mediaPickerMode === "cover") {
            updateDetails({ cover: { url: asset.url, alt: asset.filename } });
          } else {
            addGalleryAssets([asset]);
          }
        }}
        onSelectMany={(assets) => addGalleryAssets(assets)}
      />
    </div>
  );
};

export default GameDetailsEditorPage;

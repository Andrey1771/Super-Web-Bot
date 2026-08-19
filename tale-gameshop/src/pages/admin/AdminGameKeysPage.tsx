import PageHeader, { GAMES_TABS } from "../../components/layout/PageHeader";
import React, { useEffect, useState } from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { Game } from "../../models/game";
import KeyInventorySection from "../../components/admin/KeyInventorySection";
import KeyStockOverview from "../../components/admin/KeyStockOverview";

const AdminGameKeysPage: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");

  useEffect(() => {
    const gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    gameService
      .getAllGames()
      .then((list) => {
        setGames(list);
        if (list.length > 0) {
          setSelectedGameId((prev) => prev || list[0].id || "");
        }
      })
      .catch(() => {
        setGames([]);
      });
  }, []);

  return (
    <div className="admin-grid">
      <PageHeader title="Game keys" description="Key pool per game: stock, import, manual grants." breadcrumbs={["Games", "Keys"]} tabs={GAMES_TABS} />
      <KeyStockOverview onSelectGame={setSelectedGameId} />

      <div className="admin-card">
        <h2>Game keys</h2>
        <p style={{ color: "#6b7280" }}>
          Manage the activation-key pool per game: add keys, check stock, grant to a user.
        </p>
        {games.length === 0 ? (
          <p style={{ color: "#92400e" }}>
            No games in the catalog yet. Add a game in Catalog first, then you can manage its keys.
          </p>
        ) : (
          <label>
            Game
            <select
              className="input"
              value={selectedGameId}
              onChange={(event) => setSelectedGameId(event.target.value)}
            >
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title || game.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selectedGameId && <KeyInventorySection gameId={selectedGameId} />}
    </div>
  );
};

export default AdminGameKeysPage;

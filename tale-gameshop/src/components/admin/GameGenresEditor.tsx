import React from "react";
import { getAdminGenres, saveAdminGenres, type AdminGenre } from "../../api/adminGenresApi";
import CategoryListEditor from "./CategoryListEditor";

/**
 * Жанры игр. Раньше их было ровно двенадцать и жили они в коде; теперь — список в настройках, как категории софта.
 * Название можно менять когда угодно: адрес страницы жанра (/games/category/…) держится на коде и не меняется.
 */
const GameGenresEditor: React.FC<{ onSaved?: (genres: AdminGenre[]) => void }> = ({ onSaved }) => (
  <CategoryListEditor
    load={getAdminGenres}
    save={saveAdminGenres}
    onSaved={onSaved}
    noun="Genre"
    listName="Game genres"
    itemNoun="game"
    namePlaceholder="Roguelike"
    tagPlaceholder="roguelike"
    max={50}
    hint={
      <>
        The order here is the order of genres in the catalog filters. The address is the genre page link
        (/games/category/…) — renaming a genre keeps it, and it can't change once games use it.
      </>
    }
  />
);

export default GameGenresEditor;

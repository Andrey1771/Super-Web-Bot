import React from "react";
import {
  getAdminSoftwareCategories,
  saveAdminSoftwareCategories,
  type AdminSoftwareCategory,
} from "../../api/adminSoftwareApi";
import CategoryListEditor from "./CategoryListEditor";

/** Категории софта: порядок — порядок в фильтре «Category», адрес — значение ?softwareCategory=. */
const SoftwareCategoriesEditor: React.FC<{ onSaved?: (categories: AdminSoftwareCategory[]) => void }> = ({ onSaved }) => (
  <CategoryListEditor
    load={getAdminSoftwareCategories}
    save={saveAdminSoftwareCategories}
    onSaved={onSaved}
    noun="Category"
    listName="Software categories"
    itemNoun="product"
    namePlaceholder="Backup & sync"
    tagPlaceholder="backup"
    max={30}
    hint={
      <>
        The order here is the order of categories in the catalog filters. The address is part of the link
        (/games?type=software&amp;softwareCategory=…) — it can't change once products use it.
      </>
    }
  />
);

export default SoftwareCategoriesEditor;

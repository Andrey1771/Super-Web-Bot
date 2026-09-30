import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { MediaAsset } from "../../types/media";
import { resolveMediaUrl } from "../../utils/media";
import { useToast } from "../ui/ToastProvider";
import AvatarCropModal from "../../features/account/components/AvatarCropModal";
import LocalizedField from "./LocalizedField";

export type TeamMember = {
  name: string;
  role: string;
  description: string;
  badge: string;
  /** Переводы роли, подписи и ярлыка (ru/uk/pl → текст); английское поле — основное. Имя не переводится. */
  roleI18n?: Record<string, string> | null;
  descriptionI18n?: Record<string, string> | null;
  badgeI18n?: Record<string, string> | null;
  /** Адрес фотографии в медиатеке. Пусто — на витрине будет кружок с первой буквой имени. */
  photoUrl: string;
};

export const EMPTY_TEAM_MEMBER: TeamMember = { name: "", role: "", description: "", badge: "", photoUrl: "" };

/** Те же ограничения, что у аватара в профиле покупателя: одно лицо — одни правила. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Люди в разделе «Meet the team» на странице «О нас».
 *
 * Список строк, как справочник регионов рядом. Кнопки «загрузить значения по умолчанию» тут
 * намеренно нет: у команды не может быть заготовки. Раньше в разметке витрины лежали четверо
 * выдуманных сотрудников с именами и должностями — именно из-за такой «заготовки по
 * умолчанию» магазин и утверждал существование людей, которых нет.
 *
 * Пустой список — законное состояние: раздел на странице просто не рисуется.
 *
 * Фотография ставится тем же окном, что и аватар в профиле покупателя (AvatarCropModal):
 * кадр, зум, поворот и подложка под прозрачный PNG. Общая медиатека для этого не годится —
 * она отдаёт файл как есть, в своём соотношении сторон, и круглая рамка на витрине режет
 * его вслепую: у одного человека выходило пол-лица, у другого — плечо.
 */
const TeamEditor: React.FC<{
  value: TeamMember[];
  maxMembers: number;
  onChange: (next: TeamMember[] | null) => void;
}> = ({ value, maxMembers, onChange }) => {
  const rows = value;
  /** Какой строке ставим фотографию: и файл выбирается для неё, и кадрированный результат уедет туда же. */
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftUrlRef = useRef<string | null>(null);
  const { addToast } = useToast();
  const apiBaseUrl = container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl;

  /** Ссылка на выбранный файл живёт в памяти вкладки, пока её не отозвать. */
  const replaceDraftUrl = (next: string | null) => {
    if (draftUrlRef.current) {
      URL.revokeObjectURL(draftUrlRef.current);
    }
    draftUrlRef.current = next;
    setDraftPhotoUrl(next);
  };

  useEffect(
    () => () => {
      if (draftUrlRef.current) {
        URL.revokeObjectURL(draftUrlRef.current);
        draftUrlRef.current = null;
      }
    },
    []
  );

  const update = (index: number, patch: Partial<TeamMember>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const pickFileFor = (index: number) => {
    setEditingRow(index);
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сбрасываем сразу: иначе повторный выбор того же файла не вызовет onChange.
    event.target.value = "";
    if (!file) {
      setEditingRow(null);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      addToast("File too large (max 2MB).", "error");
      setEditingRow(null);
      return;
    }
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      addToast("Unsupported format. Use PNG, JPG, or WebP.", "error");
      setEditingRow(null);
      return;
    }
    replaceDraftUrl(URL.createObjectURL(file));
  };

  const closeCropModal = () => {
    replaceDraftUrl(null);
    setEditingRow(null);
  };

  /**
   * Кадрированный квадрат уезжает в медиатеку — оттуда же берут обложки игр. Хранить у
   * человека нужно адрес, а не файл: список лежит JSON-строкой в настройках сайта.
   */
  const handleCropSave = async (file: File) => {
    const index = editingRow;
    if (index === null) {
      return;
    }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post("/api/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      update(index, { photoUrl: (response.data as MediaAsset).url });
      replaceDraftUrl(null);
      setEditingRow(null);
    } catch (error: any) {
      const message = error?.response?.data;
      addToast(typeof message === "string" ? message : "Failed to upload the photo.", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="team-editor">
      <div
        className="team-editor__row"
        style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}
      >
        <span>Photo</span>
        <span>Name</span>
        <span>Role</span>
        <span>Badge</span>
        <span>What they do</span>
        <span />
      </div>

      {rows.map((row, index) => {
        const preview = resolveMediaUrl(row.photoUrl, apiBaseUrl);
        return (
          <div key={index} className="team-editor__row">
            {/* Кружок и есть кнопка, как аватар в профиле: нажатие открывает выбор файла,
                дальше — то же окно кадрирования. Пустой показывает первую букву имени —
                ровно то, что увидит покупатель, если фотографию не поставить. */}
            <div className="team-editor__photo">
              <button
                type="button"
                className="team-editor__avatar"
                onClick={() => pickFileFor(index)}
                title={row.photoUrl ? "Replace photo" : "Upload photo"}
              >
                {preview ? <img src={preview} alt="" /> : <span>{row.name.trim().charAt(0).toUpperCase() || "+"}</span>}
                <span className="team-editor__avatar-edit" aria-hidden="true">
                  <FontAwesomeIcon icon={faPen} />
                </span>
              </button>
              {row.photoUrl && (
                <button
                  type="button"
                  className="team-editor__photo-clear"
                  onClick={() => update(index, { photoUrl: "" })}
                  title="Remove photo"
                >
                  ×
                </button>
              )}
            </div>
            <input
              className="input"
              value={row.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="Jane Doe"
            />
            <LocalizedField label="Role" i18n={row.roleI18n} onI18nChange={(next) => update(index, { roleI18n: next })} placeholder={row.role || "Founder"}>
              <input
                className="input"
                value={row.role}
                onChange={(e) => update(index, { role: e.target.value })}
                placeholder="Founder"
              />
            </LocalizedField>
            <LocalizedField label="Badge" i18n={row.badgeI18n} onI18nChange={(next) => update(index, { badgeI18n: next })} placeholder={row.badge || "Support"}>
              <input
                className="input"
                value={row.badge}
                onChange={(e) => update(index, { badge: e.target.value })}
                placeholder="Support"
              />
            </LocalizedField>
            <LocalizedField
              label="What they do"
              i18n={row.descriptionI18n}
              onI18nChange={(next) => update(index, { descriptionI18n: next })}
              placeholder={row.description || "What this person actually does here."}
            >
              <input
                className="input"
                value={row.description}
                onChange={(e) => update(index, { description: e.target.value })}
                placeholder="What this person actually does here."
              />
            </LocalizedField>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              title="Remove person"
            >
              ×
            </button>
          </div>
        );
      })}

      {rows.length === 0 && (
        <p className="text-sm text-gray-500" style={{ margin: "8px 0 0" }}>
          Nobody added — the “Meet the team” section is hidden on the About page. Add real people only.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <button
          type="button"
          className="btn btn-outline"
          disabled={rows.length >= maxMembers}
          onClick={() => onChange([...rows, { ...EMPTY_TEAM_MEMBER }])}
        >
          Add person
        </button>
        {rows.length > 0 && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onChange(null)}
            title="Remove everyone and hide the section"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500" style={{ margin: "8px 0 0" }}>
        PNG/JPG/WebP • up to 2 MB • the photo is cropped to a circle, so frame the face.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* key сбрасывает состояние окна на каждый новый файл: иначе оно открывалось с зумом
          и поворотом от предыдущей фотографии. */}
      <AvatarCropModal
        key={draftPhotoUrl ?? "team-photo-empty"}
        isOpen={draftPhotoUrl !== null && editingRow !== null}
        imageSrc={draftPhotoUrl}
        isSaving={uploading}
        onClose={closeCropModal}
        onSave={handleCropSave}
      />
    </div>
  );
};

export default TeamEditor;

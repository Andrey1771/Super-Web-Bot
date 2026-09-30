import { kindLabels } from "../../utils/product-kind-labels";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminGameDetailsService } from "../../iterfaces/i-admin-game-details-service";
import type { AdminGameDiscount, AwardBadge, GameDetails, MediaItem } from "../../types/game-details";
import MediaPickerModal from "../../components/admin-panel/media-library/MediaPickerModal";
import { useToast } from "../../components/ui/ToastProvider";
import CollapsibleCard from "../../components/admin/CollapsibleCard";
import PageHeader, { GAMES_TABS } from "../../components/layout/PageHeader";
import CardCompletenessPanel from "../../components/admin/CardCompletenessPanel";
import { getCardCompleteness, type CardIssue } from "../../api/adminCompletenessApi";
import { useSitePreferences } from "../../context/site-preferences";
import { realignI18n } from "../../utils/aligned-i18n";
import GameCardPreview from "./GameCardPreview";
import SystemRequirementsEditor from "./SystemRequirementsEditor";
import LocalizedField from "../../components/admin/LocalizedField";
import DateTimeField from "./DateTimeField";
// Та же функция, что раскладывает медиа на витрине. Переиспользуем её, а не повторяем
// правило «трейлер первым» здесь: иначе админка показывала бы один порядок, а магазин другой.
import { orderMedia } from "../game-details-page/components/GameHero";
import GameSwitcher from "./GameSwitcher";
import Drawer from "../../components/ui/Drawer";
import KeyInventorySection from "../../components/admin/KeyInventorySection";
import { getKeyInventory } from "../../api/adminKeysApi";
import "./game-keys-page.css";
import {
  apiErrorMessage,
  duplicateProduct,
  getAdminSoftwareCategories,
  getProductKind,
  setProductKind,
  type AdminSoftwareCategory,
  type ProductKindState,
} from "../../api/adminSoftwareApi";
import { licenseLabel } from "../game-details-page/components/SoftwareLicenses";
import { ACTIVATION_LABELS, normalizeActivationTarget, type SoftwareActivationTarget } from "../../utils/software";

/** Сроки лицензии в форме: месяцы; пусто — бессрочная (у подписки — без срока). */
const LICENSE_TERMS: Array<{ value: number | null; label: string }> = [
  { value: 1, label: "1 month" },
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "1 year" },
  { value: 24, label: "2 years" },
  { value: 36, label: "3 years" },
  { value: null, label: "Lifetime / no term" },
];

/**
 * Размер вставляемой картинки. У markdown-синтаксиса `![](…)` размера нет вовсе, поэтому
 * всё, кроме полной ширины, вставляется тегом <img> с инлайновым стилем — он проходит
 * санитизацию на витрине (вырезаются только скрипты и обработчики событий).
 */
type ImageInsertSize = "full" | "half" | "third" | "right";

const buildImageSnippet = (size: ImageInsertSize, url: string, alt: string): string => {
  const escaped = alt.replace(/"/g, "&quot;");
  switch (size) {
    case "half":
      return `<img src="${url}" alt="${escaped}" style="width:50%">`;
    case "third":
      return `<img src="${url}" alt="${escaped}" style="width:33%">`;
    case "right":
      // Обтекание: картинка уходит вправо, текст идёт слева, отступ — чтобы строки не липли.
      return `<img src="${url}" alt="${escaped}" style="float:right;width:40%;margin:0 0 12px 16px">`;
    default:
      return `![${alt}](${url})`;
  }
};

/**
 * Сводка для свёрнутой секции. Смысл в том, чтобы закрытая карточка что-то сообщала:
 * до этого десять секций выглядели одинаковыми серыми полосками, и единственный способ
 * узнать, заполнено ли внутри хоть что-то, был открыть каждую по очереди.
 */
const countSummary = (count: number | undefined, noun: string): string =>
  !count ? `no ${noun}s` : `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Куда ведёт каждое замечание из панели полноты. Коды приходят с бэкенда
 * (GameCardCompleteness.Check), секции — якоря карточек ниже.
 */
/**
 * Замечание проверки полноты → секция формы, где оно закрывается.
 *
 * От этой таблицы зависит не только переход по клику, но и цвет точки на шаге: точка зелёная,
 * когда на шаг не пришлось ни одного замечания. Пропущенный здесь код означает, что замечание
 * не досталось никакому шагу — и шаг горит зелёным, хотя пробел есть. Так и было: из пятнадцати
 * кодов бэкенда здесь лежало десять, а systemRequirements и три про издания не лежали вовсе.
 * Из-за этого «Requirements» светился зелёным при полностью пустых требованиях, а «Commerce» —
 * при ошибке в цене издания, которая вдобавок блокирует публикацию.
 *
 * Чтобы это не повторилось молча, незнакомые коды пишутся в консоль (см. reportUnmappedIssues).
 */
const ISSUE_SECTION: Record<string, string> = {
  softwareCategory: "product",
  activation: "product",
  editionLicense: "editions",
  editionKeys: "editions",
  cover: "media",
  gallery: "media",
  trailer: "media",
  description: "general",
  tagline: "general",
  details: "general",
  genres: "general",
  languages: "credits",
  developer: "credits",
  ageRating: "credits",
  platforms: "platforms",
  systemRequirements: "sysreq",
  editionDefault: "editions",
  editionPrice: "editions",
  editionCodes: "editions",
};


/**
 * Поле карточки → секция формы, где оно правится.
 *
 * Нужно, чтобы отметить шаг с несохранёнными правками. Точки полноты приходят с сервера и
 * обновляются только после сохранения — они отвечают на вопрос «что не так с сохранённой
 * карточкой». Вопрос «что я тут наменял и ещё не сохранил» — другой, и на него отвечает эта
 * таблица: считать её на сервере нечем, а повторять во фронте правила полноты значило бы
 * завести второй источник правды, который рано или поздно разойдётся с первым.
 */
const FIELD_SECTION: Record<string, string> = {
  activation: "product",
  title: "general",
  tagline: "general",
  descriptionMarkdown: "general",
  genres: "general",
  tags: "general",
  keyFeatures: "general",
  developer: "credits",
  publisher: "credits",
  ageRating: "credits",
  languages: "credits",
  platforms: "platforms",
  cover: "media",
  gallery: "media",
  basePrice: "pricing",
  finalPrice: "pricing",
  editions: "editions",
  dlcItems: "dlc",
  systemRequirements: "sysreq",
  showInFeaturedStorefront: "featured",
  featuredStorefrontPriority: "featured",
  awards: "awards",
  similarGameIds: "recommendations",
  autoRecommendRules: "recommendations",
};

/**
 * Поля, которых нет ни в одном шаге: правятся в шапке карточки, меняются кнопкой публикации
 * или приходят с сервера. Перечислены явно, чтобы сторож ниже не ругался на них каждый раз.
 */
const FIELDS_OUTSIDE_STEPS = new Set([
  "id",
  "gameId",
  "slug",
  "isDraft",
  "isActive",
  "isNew",
  "isTopRated",
  "currency",
  "discountPercent",
  "keyType",
  "releaseDate",
  "controllerSupport",
  "cloudSavesSupported",
  "onlineFeatures",
  "ratingAvg",
  "reviewsCount",
]);

/**
 * Годы для наград: от следующего (объявляют заранее) вниз до 1980 — раньше игровых премий
 * попросту не было. Список вместо свободного ввода, потому что number принимал и «-3».
 */
const AWARD_YEARS = (() => {
  const latest = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let year = latest; year >= 1980; year--) {
    years.push(year);
  }
  return years;
})();

/** Строки textarea → список без пустых и без хвостовых пробелов. */
const linesToList = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

/**
 * Сторож от рассинхрона: бэкенд может завести новую проверку, а таблицу выше забудут дополнить —
 * и шаг снова будет молча зелёным. Дублировать список кодов бессмысленно (он бы и сам устарел),
 * поэтому сверяем то, что реально пришло с сервера.
 */
const reportUnmappedIssues = (list: CardIssue[] | null) => {
  const unmapped = (list ?? [])
    .map((issue) => issue.code)
    .filter((code) => !ISSUE_SECTION[code]);
  if (unmapped.length > 0) {
    console.warn(
      // Дедуп через filter, а не через Set: проект собирается под ES5, где Set не разворачивается.
      `[card completeness] замечания без секции: ${unmapped.filter((code, index, all) => all.indexOf(code) === index).join(", ")} — ` +
        "шаг для них останется зелёным, дополните ISSUE_SECTION."
    );
  }
};

/**
 * Шаги редактора. Прежде все десять секций лежали одной стеной на одном уровне: даже
 * с подписями это оставалось списком, в котором не видно ни где ты, ни сколько осталось.
 * Шаг показывает за раз одну-три секции, а рельс слева отвечает на оба вопроса сразу.
 */
// softwareHint — подпись того же шага у ПО: секции те же, но называются иначе (лицензии вместо изданий, вендор вместо студии).
const STEPS = [
  { key: "basics", label: "Basics", hint: "Type, title, studio, platforms", softwareHint: "Type, category, activation, vendor, OS", sections: ["product", "general", "credits", "platforms"] },
  { key: "media", label: "Media", hint: "Cover, gallery, trailer", softwareHint: "Cover, screenshots", sections: ["media"] },
  { key: "commerce", label: "Commerce", hint: "Price, editions, DLC", softwareHint: "Price, licenses, keys", sections: ["pricing", "editions", "dlc"] },
  { key: "requirements", label: "Requirements", hint: "System requirements", softwareHint: "System requirements", sections: ["sysreq"] },
  { key: "discovery", label: "Discovery", hint: "Storefront, awards, recommendations", softwareHint: "Storefront, awards, recommendations", sections: ["featured", "awards", "recommendations"] },
] as const;
type StepKey = (typeof STEPS)[number]["key"];
type StepFilter = StepKey | "all";

/** Обратная связь: в каком шаге живёт секция. Нужна, чтобы переход из панели полноты знал, куда вести. */
const SECTION_STEP: Record<string, StepKey> = STEPS.reduce((acc, step) => {
  step.sections.forEach((section) => {
    acc[section] = step.key;
  });
  return acc;
}, {} as Record<string, StepKey>);

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
  platforms: { windows: true, mac: false, linux: false, playStation: false, xbox: false, android: false, ios: false },
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
  // Валюты витрины сверх базовой — для прайс-листов изданий. Базовая цена издания живёт в price.
  const { baseCurrency, currencies } = useSitePreferences();
  const extraCurrencies = currencies.map((c) => c.code).filter((code) => code !== baseCurrency);
  const adminService = useMemo(() => container.get<IAdminGameDetailsService>(IDENTIFIERS.IAdminGameDetailsService), []);
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { gameId: routeGameId } = useParams<{ gameId: string }>();
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  // Пробелы карточки: считает сервер (те же правила, что витрина); обновляем при выборе игры и после сохранения.
  const [issues, setIssues] = useState<CardIssue[] | null>(null);
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerMode, setMediaPickerMode] = useState<"cover" | "gallery" | "description" | "award">("cover");
  // Какой награде выбирают значок. Медиатека одна на страницу, поэтому цель запоминаем здесь.
  const [awardIconIndex, setAwardIconIndex] = useState<number | null>(null);
  // Ссылка на поле описания: вставляем разметку в позицию курсора, а не в конец текста —
  // иначе картинку каждый раз пришлось бы вручную переносить на нужное место.
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [descriptionPreview, setDescriptionPreview] = useState(false);
  const [imageInsertSize, setImageInsertSize] = useState<ImageInsertSize>("full");
  // Раскрытые секции хранит страница, а не каждая карточка сама: иначе клик по замечанию
  // в панели полноты не смог бы раскрыть нужную.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ general: true });
  // "all" — показать сразу все разделы. Переключать по одному удобно, когда знаешь, что
  // правишь; когда карточку осматривают целиком, это лишние пять кликов.
  const [step, setStep] = useState<StepFilter>("basics");
  const [publishing, setPublishing] = useState(false);
  // Снимок карточки с сервера. По нему считаются несохранённые правки — без него отличить
  // «поле пустое, потому что так сохранено» от «я только что стёр» невозможно.
  const [savedDetails, setSavedDetails] = useState<GameDetails | null>(null);
  // Вид товара и категория ПО живут в самом товаре (Game), а не в карточке, и сохраняются своим запросом.
  const [productKind, setProductKindState] = useState<ProductKindState>({ kind: "Game", softwareCategory: null });
  const [savedProductKind, setSavedProductKind] = useState<ProductKindState>({ kind: "Game", softwareCategory: null });
  const [softwareCategories, setSoftwareCategories] = useState<AdminSoftwareCategory[]>([]);
  const software = productKind.kind === "Software";
  const labels = kindLabels(software);
  // Остаток ключей по кодам лицензий (базовая — под пустым кодом). Только у ПО: у каждой лицензии свой склад.
  const [keyStock, setKeyStock] = useState<Record<string, number> | null>(null);
  // Лицензия, чьи ключи открыты в панели. Панель прямо в редакторе: раньше за ключами уходили на вкладку Keys
  // и искали товар заново.
  const [keysFor, setKeysFor] = useState<{ code: string; title: string } | null>(null);
  const keysDirtyRef = useRef(false);
  const [duplicating, setDuplicating] = useState(false);
  const productKindDirty =
    productKind.kind !== savedProductKind.kind ||
    (productKind.kind === "Software" && (productKind.softwareCategory ?? "") !== (savedProductKind.softwareCategory ?? ""));

  // Публикацию закрывают только ошибки. «Стоит добавить» и «неплохо бы» не должны мешать
  // выложить карточку — иначе гейт превращается в препятствие вместо подсказки.
  const blockingErrors = (issues ?? []).filter((issue) => issue.severity === "error").length;

  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  // Переключили шаг — его разделы раскрыты. Раньше выбор шага показывал свёрнутую панель,
  // и до полей нужно было щёлкнуть ещё раз: шаг выбирают, чтобы что-то в нём править, а не
  // чтобы посмотреть на его заголовок.
  useEffect(() => {
    const sections = step === "all" ? Object.keys(SECTION_STEP) : STEPS.find((item) => item.key === step)?.sections ?? [];
    setOpenSections((prev) => {
      const next = { ...prev };
      sections.forEach((section) => {
        next[section] = true;
      });
      return next;
    });
  }, [step]);

  /** Переход из панели полноты: раскрыть нужную секцию и подвести к ней. */
  const jumpToIssue = (code: string) => {
    const section = ISSUE_SECTION[code];
    if (!section) {
      return;
    }
    // Секция может жить в другом шаге — переключаем и его, иначе клик бы «ничего не делал».
    const targetStep = SECTION_STEP[section];
    if (targetStep) {
      setStep(targetStep);
    }
    setOpenSections((prev) => ({ ...prev, [section]: true }));
    // Ждём кадр: секция должна успеть раскрыться, иначе прокрутка встанет по старой высоте.
    window.requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const insertIntoDescription = (snippet: string) => {
    if (!details) {
      return;
    }
    const field = descriptionRef.current;
    const current = details.descriptionMarkdown ?? "";
    // Поле может быть не смонтировано (свёрнутая секция) — тогда просто дописываем в конец.
    const start = field ? field.selectionStart : current.length;
    const end = field ? field.selectionEnd : current.length;
    // Картинка — блочный элемент: отбиваем пустыми строками, иначе markdown приклеит её к абзацу.
    const before = current.slice(0, start).replace(/\s*$/, "");
    const after = current.slice(end).replace(/^\s*/, "");
    const next = `${before}${before ? "\n\n" : ""}${snippet}${after ? "\n\n" : ""}${after}`;
    updateDetails({ descriptionMarkdown: next });
    // Возвращаем курсор за вставку, чтобы можно было сразу писать дальше.
    const caret = (before ? before.length + 2 : 0) + snippet.length;
    window.requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  };
  const [discount, setDiscount] = useState<AdminGameDiscount>({ gameId: "", isActive: false });

  // Игра берётся из адреса. Прежде здесь грузился ВЕСЬ каталог одним запросом только ради
  // выпадающего списка — на 10 000 игр это мегабайты трафика и неработоспособный <select>.
  // Выбор игры — задача каталога, у него для этого есть постраничный поиск.
  useEffect(() => {
    const fromPath = routeGameId;
    const fromQuery = new URLSearchParams(location.search).get("gameId");
    setSelectedGameId(fromPath ?? fromQuery ?? "");
  }, [routeGameId, location.search]);

  useEffect(() => {
    getAdminSoftwareCategories()
      .then(setSoftwareCategories)
      .catch((error) => console.error("Failed to load software categories", error));
  }, []);

  useEffect(() => {
    if (!selectedGameId) return;
    let cancelled = false;
    getProductKind(selectedGameId)
      .then((state) => {
        if (cancelled) return;
        setProductKindState(state);
        setSavedProductKind(state);
      })
      .catch((error) => console.error("Failed to load product kind", error));
    return () => {
      cancelled = true;
    };
  }, [selectedGameId]);

  useEffect(() => {
    if (!selectedGameId) return;
    const loadDetails = async () => {
      try {
        setLoading(true);
        const response = await adminService.getGameDetails(selectedGameId);
        setDetails(response);
        setSavedDetails(response);
        getCardCompleteness(selectedGameId)
          .then((list) => {
            reportUnmappedIssues(list);
            setIssues(list);
          })
          .catch(() => setIssues(null));
      } catch (error) {
        console.error(error);
        // Деталей ещё нет (новая игра) — показываем пустую форму, привязанную к её id.
        const blank = emptyDetails(selectedGameId, "", "");
        setDetails(blank);
        setSavedDetails(blank);
      } finally {
        setLoading(false);
      }
    };
    loadDetails();
  }, [adminService, selectedGameId]);

  const loadKeyStock = React.useCallback(async (gameId: string) => {
    try {
      const inventory = await getKeyInventory(gameId);
      const next: Record<string, number> = {};
      (inventory.byEdition ?? []).forEach((row) => {
        next[row.editionCode || ""] = (next[row.editionCode || ""] ?? 0) + row.available;
      });
      setKeyStock(next);
    } catch {
      setKeyStock(null);
    }
  }, []);

  useEffect(() => {
    if (!selectedGameId || !software) {
      setKeyStock(null);
      return;
    }
    loadKeyStock(selectedGameId);
  }, [loadKeyStock, selectedGameId, software]);

  const closeKeys = () => {
    if (keysDirtyRef.current && !window.confirm("The keys you pasted have not been added yet. Close and lose them?")) {
      return;
    }
    keysDirtyRef.current = false;
    setKeysFor(null);
    // Ключи могли добавить — обновляем и склад у лицензий, и замечание «нет ключей» в панели полноты.
    if (selectedGameId) {
      loadKeyStock(selectedGameId);
      getCardCompleteness(selectedGameId).then(setIssues).catch(() => undefined);
    }
  };

  const duplicate = async () => {
    if (!details) {
      return;
    }
    const unsaved = Object.values(unsavedBySection).reduce((sum, count) => sum + count, 0);
    if (unsaved > 0 && !window.confirm("The copy is made from the saved card — your unsaved changes won't be in it. Continue?")) {
      return;
    }
    setDuplicating(true);
    try {
      const copy = await duplicateProduct(details.gameId);
      addToast(`Created “${copy.title}” as a draft — rename it and add keys before publishing.`, "success");
      navigate(`/admin/games/${copy.id}/edit`);
    } catch (error) {
      addToast(apiErrorMessage(error, "Failed to duplicate the product."), "error");
    } finally {
      setDuplicating(false);
    }
  };

  const updateDetails = (patch: Partial<GameDetails>) => {
    setDetails((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  /**
   * Сколько несохранённых правок в каждой секции. Сравниваем текущую карточку с той, что
   * пришла с сервера: у полей нет собственного признака «изменено», а гадать по фокусу
   * или количеству нажатий значило бы врать при отмене правки руками.
   */
  const unsavedBySection = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!details || !savedDetails) {
      return counts;
    }
    const stray: string[] = [];
    (Object.keys(details) as Array<keyof GameDetails>).forEach((key) => {
      const field = String(key);
      if (JSON.stringify(details[key]) === JSON.stringify(savedDetails[key])) {
        return;
      }
      const section = FIELD_SECTION[field];
      if (!section) {
        if (!FIELDS_OUTSIDE_STEPS.has(field)) {
          stray.push(field);
        }
        return;
      }
      counts[section] = (counts[section] ?? 0) + 1;
    });
    if (stray.length > 0) {
      console.warn(
        `[unsaved] изменённые поля без секции: ${stray.join(", ")} — правка не отметится ни на одном шаге, дополните FIELD_SECTION.`
      );
    }
    if (productKindDirty) {
      counts.product = (counts.product ?? 0) + 1;
    }
    return counts;
  }, [details, savedDetails, productKindDirty]);

  /**
   * Номер, под которым кадр встанет на странице игры. Порядок в списке админки и порядок на
   * витрине — не одно и то же: трейлер витрина поднимает наверх независимо от того, где он
   * лежит здесь. Без этих номеров понять, что получится, можно было только открыв превью.
   */
  const storefrontPosition = useMemo(() => {
    const map: Record<string, number> = {};
    if (!details) {
      return map;
    }
    orderMedia(details).forEach((item, index) => {
      if (item.id) {
        map[item.id] = index + 1;
      }
    });
    return map;
  }, [details]);

  /** Замечания, относящиеся к одной секции. */
  const issuesOfSection = (section: string) =>
    (issues ?? []).filter((issue) => ISSUE_SECTION[issue.code] === section);

  /**
   * Причина, по которой у шага не зелёная точка, — прямо в самой секции.
   *
   * Раньше число на чипе говорило «здесь один пробел», а что именно за пробел — знала только
   * панель наверху страницы. Стоя на шаге «Media» с заполненной обложкой и картинкой в
   * галерее, понять, чего не хватает (трейлера), было неоткуда: панель уехала за экран.
   */
  const renderSectionIssues = (section: string) => {
    const list = issuesOfSection(section);
    if (list.length === 0) {
      return null;
    }
    return (
      <CardCompletenessPanel
        issues={list}
        heading="What's missing here"
        canJump={() => false}
      />
    );
  };

  /** Список замечаний шага одной строкой — для всплывающей подсказки на чипе. */
  const stepIssuesTitle = (sections: readonly string[]) =>
    sections
      .flatMap((section) => issuesOfSection(section))
      .map((issue) => issue.message)
      .join("\n");

  const unsavedInStep = (sections: readonly string[]) =>
    sections.reduce((sum, section) => sum + (unsavedBySection[section] ?? 0), 0);

  const unsavedTotal = Object.keys(unsavedBySection).reduce((sum, key) => sum + unsavedBySection[key], 0);

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


  /**
   * Публикация и снятие с витрины. Отдельным действием, а не галочкой в форме: это не поле
   * карточки, а решение «показывать покупателям или нет», и подтверждать его случайным
   * «Save all» вместе с правкой опечатки не следует.
   */
  const setPublishState = async (draft: boolean) => {
    if (!details) {
      return;
    }
    setPublishing(true);
    try {
      const updated = await adminService.updateDetails(details.gameId, { ...details, isDraft: draft });
      setDetails(updated);
      setSavedDetails(updated);
      addToast(draft ? "Moved to draft — hidden from the store." : "Published.", "success");
    } catch (error) {
      console.error(error);
      addToast(draft ? "Failed to unpublish." : "Failed to publish.", "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleSave = async () => {
    if (!details) return;
    // Вид товара — первым: если сервер его не примет (нет категории), карточку не сохраняем вслепую,
    // иначе админ ушёл бы со страницы, решив, что ПО уже в разделе /software.
    if (productKindDirty) {
      try {
        const savedKind = await setProductKind(details.gameId, productKind);
        setProductKindState(savedKind);
        setSavedProductKind(savedKind);
      } catch (error) {
        addToast(apiErrorMessage(error, "Failed to change the product type."), "error");
        return;
      }
    }
    try {
      const updated = await adminService.updateDetails(details.gameId, details);
      setDetails(updated);
      setSavedDetails(updated);
      // Предупреждения после сохранения — чтобы пробелы были видны сразу, а не когда покупатель спросит.
      const fresh = await getCardCompleteness(details.gameId).catch(() => null);
      setIssues(fresh);
      const missing = fresh?.filter((issue) => issue.severity === "error").length ?? 0;
      addToast(
        missing > 0 ? `Saved — ${missing} required block${missing === 1 ? "" : "s"} still missing (see the panel above).` : "Card saved.",
        missing > 0 ? "info" : "success"
      );
    } catch (error) {
      console.error(error);
      addToast("Failed to save the card.", "error");
    }
  };

  const updateListField = (field: keyof GameDetails, value: string) => {
    const next = linesToList(value);
    if (field === "genres" || field === "tags") {
      // Переводы по позициям следуют за значениями: удаление или перестановка строки не сдвигает их на чужой пункт.
      const i18nField = field === "genres" ? "genresI18n" : "tagsI18n";
      setDetails((prev) => (prev ? { ...prev, [field]: next, [i18nField]: realignI18n(prev[field], next, prev[i18nField]) } : prev));
      return;
    }
    updateDetails({ [field]: next } as Partial<GameDetails>);
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
    // У ПО новое издание — лицензия: сразу со сроком и устройствами, иначе проверка карточки
    // пожалуется, что варианты на витрине не различить.
    const license = software ? { licenseTermMonths: 12, licenseDevices: 1, isSubscription: false } : {};
    updateDetails({
      editions: [
        ...details.editions,
        {
          code: `${labels.edition}-${Date.now()}`,
          title: software ? licenseLabel({ code: "", title: "", description: "", price: 0, ...license }) : "New edition",
          description: "",
          price: 0,
          discountPercent: undefined,
          includedItems: [],
          isDefault: details.editions.length === 0,
          ...license
        }
      ]
    });
  };

  const updateAward = (index: number, patch: Partial<AwardBadge>) => {
    if (!details) return;
    const next = [...(details.awards ?? [])];
    // Патчим запись целиком, а не собираем её заново из названия: у награды есть ещё тип,
    // год и значок, и прежний textarea пересобирал массив из одних названий — всё остальное
    // стиралось при первом же нажатии клавиши.
    next[index] = { ...next[index], ...patch };
    updateDetails({ awards: next });
  };

  const addAward = () => updateDetails({ awards: [...(details?.awards ?? []), { title: "" }] });

  const removeAward = (index: number) =>
    updateDetails({ awards: (details?.awards ?? []).filter((_, position) => position !== index) });

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
      <div className="admin-grid">
        <PageHeader title="Product details" description="Extended card of a game or software: descriptions, media, editions or licenses, requirements." breadcrumbs={["Catalog", "Product details"]} tabs={GAMES_TABS} />
        <div className="admin-card">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="admin-field">
              {/* Раньше здесь был только текст «Select a game», а поиск игры стоял ниже по
                  разметке — то есть появлялся, лишь когда игра уже открыта. Попасть в
                  редактор с самой страницы было нельзя: она работала только как приёмник
                  ссылки из каталога. */}
              <label htmlFor="game-switch">Product</label>
              <GameSwitcher currentTitle="" onPick={(id) => navigate(`/admin/games/${id}/edit`)} />
              <p className="editor-pick__hint">
                Find a game or software to edit its extended card — or open one from the Catalog tab.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Сводки для свёрнутых секций. Считаются здесь, а не в разметке, чтобы заголовки
  // карточек оставались читаемыми.
  const trailers = details.gallery?.filter((item) => item.isTrailer).length ?? 0;
  const mediaSummary = details.gallery?.length
    ? `${countSummary(details.gallery.length, "item")}${trailers ? ` · ${trailers} trailer${trailers === 1 ? "" : "s"}` : ""}`
    : "no media";
  const discountLabel = Number(details.discountPercent) > 0 ? ` · −${details.discountPercent}%` : "";
  const pricingSummary = Number(details.basePrice) > 0
    ? `${details.basePrice} ${details.currency}${discountLabel}`
    : "price not set";
  const enabledPlatforms = Object.entries(details.platforms ?? {})
    .filter(([, on]) => Boolean(on))
    .map(([key]) => key);
  const platformsSummary = enabledPlatforms.length ? enabledPlatforms.join(", ") : "none selected";
  // Сводка по требованиям — какие системы вообще заполнены. Прежняя говорила лишь «filled in»
  // про Windows, хотя Mac и Linux хранятся рядом и о них не было ни слова.
  const filledRequirements = (["windows", "mac", "linux"] as const)
    .filter((os) => details.systemRequirements?.[os]?.minimum?.os)
    .map((os) => (os === "windows" ? "Windows" : os === "mac" ? "macOS" : "Linux"));
  const sysreqSummary = filledRequirements.length ? filledRequirements.join(", ") : "empty";
  // Сводка раздела студии: что из трёх групп заполнено. Пустые не перечисляем — важно
  // видеть, чего не хватает, а не читать три раза «нет».
  const creditsFilled = [
    details.developer?.name ? "developer" : null,
    details.publisher?.name ? "publisher" : null,
    (details.languages?.text?.length ?? 0) > 0 ? "languages" : null,
    details.ageRating?.label ? "age rating" : null,
  ].filter(Boolean) as string[];
  const creditsSummary = creditsFilled.length ? creditsFilled.join(", ") : "empty";

  return (
    <div className="admin-grid">
      <PageHeader
        title="Product details"
        description="Extended card of a game or software: descriptions, media, editions or licenses, requirements."
        breadcrumbs={["Catalog", "Product details"]}
        tabs={GAMES_TABS}
      />

      {/* Публикация — свой блок. Состояние карточки, чем оно грозит, что мешает её показать
          и кнопка переключения: это всё об одном — видят ли её покупатели. Раньше пробелы
          жили отдельной плашкой, а статус с кнопкой — в третьем месте, хотя кнопка
          публикации как раз этими пробелами и блокируется. */}
      <section className="publish-block">
        <div className="publish-block__head">
          <span className={`publish-state publish-state--${details.isDraft ? "draft" : "live"}`}>
            {details.isDraft ? "Draft" : "Published"}
          </span>
          <p className="publish-block__note">
            {details.isDraft
              ? "Not visible in the store — publish when the card is ready."
              : "Visible in the store."}
          </p>
          {details.isDraft ? (
            <button
              className="btn btn-primary"
              disabled={blockingErrors > 0 || publishing}
              title={
                blockingErrors > 0
                  ? `Close ${blockingErrors} required gap${blockingErrors === 1 ? "" : "s"} before publishing`
                  : undefined
              }
              onClick={() => setPublishState(false)}
            >
              {blockingErrors > 0 ? `Publish — ${blockingErrors} to fix` : "Publish"}
            </button>
          ) : (
            <button className="btn btn-outline" disabled={publishing} onClick={() => setPublishState(true)}>
              Unpublish
            </button>
          )}
        </div>
        {issues && (
          <CardCompletenessPanel
            issues={issues}
            onIssueClick={jumpToIssue}
            canJump={(code) => Boolean(ISSUE_SECTION[code])}
          />
        )}
      </section>

      {/* Раздельный вид: форма слева, живое превью справа. Внутри формы превью стояло
          посреди полей и разрывало её пополам — смотреть на результат и править поля
          одновременно было нельзя. */}
      <div className={`editor-split${descriptionPreview ? " is-open" : ""}`}>
        <div className="editor-split__form">
      <div className="admin-card">
        <div className="admin-grid admin-grid--2">
          {/* Вместо выпадающего списка со всеми играми — поиск по каталогу. Список не
              масштабируется: на 10 000 игр это и неработоспособный <select>, и мегабайты
              трафика на каждое открытие редактора. */}
          <div className="admin-field">
            <label htmlFor="game-switch">Product</label>
            <GameSwitcher
              currentTitle={details.title}
              onPick={(id) => navigate(`/admin/games/${id}/edit`)}
            />
          </div>
          <label>
            Slug
            <input
              className="input"
              value={details.slug}
              onChange={(event) => updateDetails({ slug: event.target.value })}
            />
          </label>
        </div>
        {/* Копия — для похожего товара: ещё один VPN с той же линейкой лицензий не собирают с нуля. */}
        <div className="editor-duplicate">
          <button type="button" className="btn btn-outline btn-small" disabled={duplicating} onClick={duplicate}>
            {duplicating ? "Duplicating…" : "Duplicate as draft"}
          </button>
          <span className="editor-pick__hint">
            {software
              ? "Copies the card, licenses with prices, activation and OS. Keys and reviews stay with this product."
              : "Copies the card, editions with prices and requirements. Keys and reviews stay with this product."}
          </span>
        </div>
      </div>

      {/* Рельс шагов. Отвечает на два вопроса, на которые стена из десяти секций не отвечала
          никак: где я сейчас и что ещё не заполнено. Точка у шага — из тех же данных полноты,
          что и панель сверху, так что второго источника правды нет. */}
      <nav className="editor-steps" aria-label="Card sections">
        {/* «All» — осмотреть карточку целиком. Шаги хороши, когда правишь известное место,
            но чтобы просто увидеть всё заполненное, приходилось обойти пять вкладок. */}
        <button
          type="button"
          className={`editor-steps__item editor-steps__item--all${step === "all" ? " is-active" : ""}`}
          aria-current={step === "all" ? "step" : undefined}
          onClick={() => setStep("all")}
        >
          <span className="editor-steps__body">
            <span className="editor-steps__label">All</span>
            <span className="editor-steps__hint">Every section at once</span>
          </span>
          {unsavedTotal > 0 && (
            <span className="editor-steps__unsaved" title={`${unsavedTotal} unsaved change${unsavedTotal === 1 ? "" : "s"}`}>
              ({unsavedTotal})
            </span>
          )}
        </button>
        {STEPS.map((item) => {
          const stepIssues = (issues ?? []).filter((issue) => {
            const section = ISSUE_SECTION[issue.code];
            return section ? SECTION_STEP[section] === item.key : false;
          });
          const worst = stepIssues.some((issue) => issue.severity === "error")
            ? "error"
            : stepIssues.length > 0
              ? "warning"
              : "ok";
          return (
            <button
              key={item.key}
              type="button"
              className={`editor-steps__item${step === item.key ? " is-active" : ""}`}
              aria-current={step === item.key ? "step" : undefined}
              // Причина не зелёной точки — по наведению, не заходя в раздел.
              title={stepIssuesTitle(item.sections) || undefined}
              onClick={() => setStep(item.key)}
            >
              <span className={`editor-steps__dot editor-steps__dot--${worst}`} aria-hidden="true" />
              <span className="editor-steps__body">
                <span className="editor-steps__label">{item.label}</span>
                <span className="editor-steps__hint">{software ? item.softwareHint : item.hint}</span>
              </span>
              {stepIssues.length > 0 && <span className="editor-steps__count">{stepIssues.length}</span>}
              {/* Несохранённое — в скобках и другим цветом, чтобы не путать с числом пробелов
                  рядом: пробелы про сохранённую карточку, скобки про то, что ещё не ушло. */}
              {unsavedInStep(item.sections) > 0 && (
                <span
                  className="editor-steps__unsaved"
                  title={`${unsavedInStep(item.sections)} unsaved change${unsavedInStep(item.sections) === 1 ? "" : "s"}`}
                >
                  ({unsavedInStep(item.sections)})
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {(step === "all" || step === "basics") && (
        <>
      {/* Игра или ПО. От вида зависят раздел витрины (/games или /software), поля карточки, проверки
          полноты и налоговый код в заказе. Вид и категория хранятся в самом товаре и уходят своим запросом
          при «Save all»; активация — часть карточки. */}
      <CollapsibleCard
        id="product"
        open={!!openSections["product"]}
        onToggle={() => toggleSection("product")}
        title="Product type"
        summary={software ? `Software · ${softwareCategories.find((c) => c.tag === productKind.softwareCategory)?.title ?? "no category"}` : "Game"}
      >
        {renderSectionIssues("product")}
        <div className="kind-switch" role="radiogroup" aria-label="Product type">
          {(["Game", "Software"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={productKind.kind === kind}
              className={productKind.kind === kind ? "is-active" : ""}
              onClick={() => setProductKindState((prev) => ({ ...prev, kind }))}
            >
              {kind}
            </button>
          ))}
        </div>
        {productKind.kind !== savedProductKind.kind && (
          <p className="editor-pick__hint">
            {software
              ? "After saving, the product is marked Software in the catalog and found under the Software product type: genres, age rating and DLC stop showing, editions become licenses."
              : "After saving, the product is listed with games again and leaves its software category."}
          </p>
        )}

        {software && (
          <>
            <div className="admin-grid admin-grid--2" style={{ marginTop: 12 }}>
              <label>
                Software category
                <select
                  className="input"
                  value={productKind.softwareCategory ?? ""}
                  onChange={(event) => setProductKindState((prev) => ({ ...prev, softwareCategory: event.target.value || null }))}
                >
                  <option value="">— pick a category —</option>
                  {softwareCategories.map((category) => (
                    <option key={category.tag} value={category.tag}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Activates on
                <select
                  className="input"
                  value={details.activation ? normalizeActivationTarget(details.activation.target) : ""}
                  onChange={(event) =>
                    updateDetails({
                      activation: event.target.value
                        ? { ...(details.activation ?? {}), target: event.target.value as SoftwareActivationTarget }
                        : null
                    })
                  }
                >
                  <option value="">— not set —</option>
                  {(Object.keys(ACTIVATION_LABELS) as SoftwareActivationTarget[]).map((target) => (
                    <option key={target} value={target}>
                      {ACTIVATION_LABELS[target]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {details.activation && (
              <div className="admin-grid admin-grid--2">
                <label>
                  Where to activate (link)
                  <input
                    className="input"
                    placeholder="https://vendor.example/licenses"
                    value={details.activation.url ?? ""}
                    onChange={(event) => updateDetails({ activation: { ...details.activation!, url: event.target.value || null } })}
                  />
                </label>
                <label>
                  Place name shown to buyers
                  <LocalizedField label="Place name" i18n={details.activation.labelI18n} placeholder={details.activation.label ?? ""} onI18nChange={(next) => updateDetails({ activation: { ...details.activation!, labelI18n: next } })}>
                    <input
                      className="input"
                      placeholder="Nova account"
                      value={details.activation.label ?? ""}
                      onChange={(event) => updateDetails({ activation: { ...details.activation!, label: event.target.value || null } })}
                    />
                  </LocalizedField>
                </label>
              </div>
            )}
            <p className="editor-pick__hint">
              The store says “Activate on {details.activation?.label || "…"}” and builds activation steps from this choice.
              Without a name it uses the link's site, then the option above.
            </p>
          </>
        )}
      </CollapsibleCard>

      <CollapsibleCard id="general" open={!!openSections["general"]} onToggle={() => toggleSection("general")} title="General">
        {renderSectionIssues("general")}
        <div className="admin-grid admin-grid--2">
          <label>
            Title
            <input className="input" value={details.title} onChange={(event) => updateDetails({ title: event.target.value })} />
          </label>
          <label>
            Tagline
            <LocalizedField label="Tagline" i18n={details.taglineI18n} placeholder={details.tagline} onI18nChange={(next) => updateDetails({ taglineI18n: next })}>
              <input className="input" value={details.tagline} onChange={(event) => updateDetails({ tagline: event.target.value })} />
            </LocalizedField>
          </label>
        </div>
        {/* Обёртка — div, а не label. У label неявно управляемым элементом становится ПЕРВЫЙ
            интерактивный потомок, и им оказывалась кнопка «Insert image»: клик по подсказке
            или по пустому месту ярлыка открывал медиатеку. Привязываем подпись к полю явно. */}
        <div className="admin-field">
          <label htmlFor="game-description-md">Description (markdown)</label>
          {/* Панель прижата к левому краю прямо над полем: при space-between на всю ширину
              формы кнопки уезжали к правому краю и переставали читаться как инструменты
              этого поля. */}
          <div className="admin-md__toolbar">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setMediaPickerMode("description");
                setMediaPickerOpen(true);
              }}
            >
              Insert image
            </button>
            {/* Размер выбирается ДО вставки: у markdown-синтаксиса ![](…) размера нет вовсе,
                поэтому для всего, кроме полной ширины, вставляем <img> с инлайновым стилем. */}
            <select
              className="input admin-md__size"
              value={imageInsertSize}
              onChange={(event) => setImageInsertSize(event.target.value as ImageInsertSize)}
              aria-label="Size of the inserted image"
            >
              <option value="full">Full width</option>
              <option value="half">Half width</option>
              <option value="third">One third</option>
              <option value="right">Float right</option>
            </select>
            <span className="admin-md__hint">
              Markdown and inline HTML. Size can also be changed by hand in the tag, e.g.{" "}
              <code>&lt;img style="width:60%"&gt;</code>.
            </span>
          </div>
          {/* Переводы описания — те же вкладки; панель вставки картинок работает с английским полем. */}
          <LocalizedField label="Description" multiline rows={12} i18n={details.descriptionMarkdownI18n} onI18nChange={(next) => updateDetails({ descriptionMarkdownI18n: next })}>
            <textarea
              id="game-description-md"
              ref={descriptionRef}
              className="input admin-md__area"
              value={details.descriptionMarkdown}
              onChange={(event) => updateDetails({ descriptionMarkdown: event.target.value })}
            />
          </LocalizedField>
        </div>

        <div className={`admin-grid ${software ? "admin-grid--2" : "admin-grid--3"}`}>
          {/* У ПО жанров нет — вместо них категория раздела в блоке «Product type». */}
          {!software && (
            <label>
              Genres (one per line)
              {/* Переводы — построчно, в том же порядке, что английские жанры; пустая строка — без перевода. */}
              <LocalizedField
                label="Genres"
                multiline
                placeholder={details.genres.join("\n")}
                i18n={Object.fromEntries(Object.entries(details.genresI18n ?? {}).map(([code, lines]) => [code, (lines ?? []).join("\n")]))}
                onI18nChange={(next) => updateDetails({ genresI18n: Object.fromEntries(Object.entries(next).map(([code, text]) => [code, text.split("\n")])) })}
              >
                <textarea className="input" rows={4} value={details.genres.join("\n")} onChange={(event) => updateListField("genres", event.target.value)} />
              </LocalizedField>
            </label>
          )}
          <label>
            Tags (one per line)
            <LocalizedField
              label="Tags"
              multiline
              placeholder={details.tags.join("\n")}
              i18n={Object.fromEntries(Object.entries(details.tagsI18n ?? {}).map(([code, lines]) => [code, (lines ?? []).join("\n")]))}
              onI18nChange={(next) => updateDetails({ tagsI18n: Object.fromEntries(Object.entries(next).map(([code, text]) => [code, text.split("\n")])) })}
            >
              <textarea className="input" rows={4} value={details.tags.join("\n")} onChange={(event) => updateListField("tags", event.target.value)} />
            </LocalizedField>
          </label>
          <label>
            Key features (one per line)
            <LocalizedField
              label="Key features"
              multiline
              i18n={Object.fromEntries(Object.entries(details.keyFeaturesI18n ?? {}).map(([code, lines]) => [code, (lines ?? []).join("\n")]))}
              onI18nChange={(next) => updateDetails({ keyFeaturesI18n: Object.fromEntries(Object.entries(next).map(([code, text]) => [code, text.split("\n")])) })}
            >
              <textarea className="input" rows={4} value={details.keyFeatures.join("\n")} onChange={(event) => updateListField("keyFeatures", event.target.value)} />
            </LocalizedField>
          </label>
        </div>
      </CollapsibleCard>

      {/* Студия, языки и возрастной рейтинг. Проверка полноты жаловалась на разработчика,
          языки и рейтинг, а полей для них в админке не было ни здесь, ни где-либо ещё:
          попасть в карточку эти данные могли только через сид. */}
      <CollapsibleCard id="credits" open={!!openSections["credits"]} onToggle={() => toggleSection("credits")} title={labels.credits} summary={creditsSummary}>
        {renderSectionIssues("credits")}
        <div className="admin-grid admin-grid--2">
          <fieldset className="studio">
            <legend className="studio__legend">{labels.developer}</legend>
            <label>
              Name
              <input
                className="input"
                value={details.developer?.name ?? ""}
                onChange={(event) => updateDetails({ developer: { ...details.developer, name: event.target.value } })}
              />
            </label>
            <label>
              Website
              <input
                className="input"
                placeholder="https://studio.example"
                value={details.developer?.website ?? ""}
                onChange={(event) => updateDetails({ developer: { ...details.developer, name: details.developer?.name ?? "", website: event.target.value } })}
              />
            </label>
            <label>
              Logo URL
              <input
                className="input"
                value={details.developer?.logoUrl ?? ""}
                onChange={(event) => updateDetails({ developer: { ...details.developer, name: details.developer?.name ?? "", logoUrl: event.target.value } })}
              />
            </label>
          </fieldset>

          <fieldset className="studio">
            <legend className="studio__legend">
              Publisher
              {/* У множества игр издатель и разработчик — одна компания; перепечатывать
                  три поля вручную незачем. */}
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={() => updateDetails({ publisher: { ...details.developer, name: details.developer?.name ?? "" } })}
              >
                Same as developer
              </button>
            </legend>
            <label>
              Name
              <input
                className="input"
                value={details.publisher?.name ?? ""}
                onChange={(event) => updateDetails({ publisher: { ...details.publisher, name: event.target.value } })}
              />
            </label>
            <label>
              Website
              <input
                className="input"
                placeholder="https://publisher.example"
                value={details.publisher?.website ?? ""}
                onChange={(event) => updateDetails({ publisher: { ...details.publisher, name: details.publisher?.name ?? "", website: event.target.value } })}
              />
            </label>
            <label>
              Logo URL
              <input
                className="input"
                value={details.publisher?.logoUrl ?? ""}
                onChange={(event) => updateDetails({ publisher: { ...details.publisher, name: details.publisher?.name ?? "", logoUrl: event.target.value } })}
              />
            </label>
          </fieldset>
        </div>

        {/* Возрастной рейтинг — игровое понятие: у ПО блок не показывается ни здесь, ни на витрине. */}
        {!software && (
        <div className="admin-grid admin-grid--3">
          <label>
            Age rating system
            <input
              className="input"
              placeholder="PEGI"
              value={details.ageRating?.system ?? ""}
              onChange={(event) => updateDetails({ ageRating: { label: details.ageRating?.label ?? "", ...details.ageRating, system: event.target.value } })}
            />
          </label>
          <label>
            Age rating label
            <LocalizedField label="Age rating label" i18n={details.ageRating?.labelI18n} placeholder={details.ageRating?.label ?? ""} onI18nChange={(next) => updateDetails({ ageRating: { system: details.ageRating?.system ?? "", label: details.ageRating?.label ?? "", ...details.ageRating, labelI18n: next } })}>
              <input
                className="input"
                placeholder="18"
                value={details.ageRating?.label ?? ""}
                onChange={(event) => updateDetails({ ageRating: { system: details.ageRating?.system ?? "", ...details.ageRating, label: event.target.value } })}
              />
            </LocalizedField>
          </label>
          <label>
            Rating icon URL
            <input
              className="input"
              value={details.ageRating?.iconUrl ?? ""}
              onChange={(event) => updateDetails({ ageRating: { system: details.ageRating?.system ?? "", label: details.ageRating?.label ?? "", ...details.ageRating, iconUrl: event.target.value } })}
            />
          </label>
        </div>
        )}

        <div className="admin-grid admin-grid--2">
          <label>
            Audio languages (one per line)
            <textarea
              className="input"
              rows={4}
              value={(details.languages?.audio ?? []).join("\n")}
              onChange={(event) => updateDetails({ languages: { text: details.languages?.text ?? [], audio: linesToList(event.target.value) } })}
            />
          </label>
          <label>
            Text languages (one per line)
            <textarea
              className="input"
              rows={4}
              value={(details.languages?.text ?? []).join("\n")}
              onChange={(event) => updateDetails({ languages: { audio: details.languages?.audio ?? [], text: linesToList(event.target.value) } })}
            />
          </label>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="platforms" open={!!openSections["platforms"]} onToggle={() => toggleSection("platforms")} title={labels.platforms} summary={platformsSummary}>
        {renderSectionIssues("platforms")}
        {/* Для чего продаётся ключ — иконки на витринных карточках и фильтр каталога ?platforms=.
            Пока ничего не отмечено, витрина считает игру PC-игрой (дефолт сервера).
            У ПО — системы, где работает программа: фильтр «Works on» в разделе /software. */}
        <div className="admin-grid admin-grid--3">
          {(software
            ? ([
                ["windows", "Windows"],
                ["mac", "macOS"],
                ["linux", "Linux"],
                ["android", "Android"],
                ["ios", "iOS"]
              ] as const)
            : ([
                ["windows", "PC (Windows)"],
                ["mac", "Mac"],
                ["linux", "Linux"],
                ["playStation", "PlayStation"],
                ["xbox", "Xbox"]
              ] as const)
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(details.platforms[key])}
                onChange={(event) =>
                  updateDetails({ platforms: { ...details.platforms, [key]: event.target.checked } })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </CollapsibleCard>
        </>
      )}

      {(step === "all" || step === "media") && (
        <>
      <CollapsibleCard id="media" open={!!openSections["media"]} onToggle={() => toggleSection("media")} title="Media" summary={mediaSummary}>
        {renderSectionIssues("media")}
        <p className="text-sm text-gray-500">Upload images or videos, arrange the gallery, and mark a trailer.</p>
        {/* Два правила, которые нигде не были записаны: трейлером может быть только видео, и
            витрина поднимает его наверх сама — двигать его стрелками не нужно. */}
        <p className="editor-pick__hint">
          The trailer is always shown first on the store page — only a video can be marked as one.
          Arrows set the order of everything else. The number on each item is its position in the store.
        </p>
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
                    <span className="gallery-item__head">
                      {/* Номер — позиция на странице игры, а не строка в этом списке. */}
                      <span className="gallery-item__position" title="Position on the store page">
                        #{storefrontPosition[item.id ?? ""] ?? index + 1}
                      </span>
                      <span className="text-xs font-semibold uppercase text-gray-500">{item.type}</span>
                      {item.isTrailer && <span className="gallery-item__badge">shown first</span>}
                    </span>
                    {item.type === "video" ? (
                      <button
                        className={`btn btn-small ${item.isTrailer ? "btn-primary" : "btn-outline"}`}
                        onClick={() => setTrailer(item.id)}
                      >
                        {item.isTrailer ? "Trailer" : "Set trailer"}
                      </button>
                    ) : (
                      // Раньше у картинки здесь было пусто, и почему трейлер выбрать нельзя —
                      // приходилось догадываться.
                      <span className="gallery-item__note">Only a video can be a trailer</span>
                    )}
                  </div>
                  <LocalizedField label="Caption" i18n={item.captionI18n} placeholder={item.caption ?? ""} onI18nChange={(next) => updateGalleryItem(index, { captionI18n: next })}>
                    <input
                      className="input"
                      placeholder="Caption"
                      value={item.caption ?? ""}
                      onChange={(event) => updateGalleryItem(index, { caption: event.target.value })}
                    />
                  </LocalizedField>
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
      </CollapsibleCard>
        </>
      )}


      {(step === "all" || step === "commerce") && (
        <>
      <CollapsibleCard id="pricing" open={!!openSections["pricing"]} onToggle={() => toggleSection("pricing")} title="Pricing" summary={pricingSummary}>
        {renderSectionIssues("pricing")}
        <div className="admin-grid admin-grid--3">
          <label>
            Base price
            <input className="input" type="number" value={details.basePrice} onChange={(event) => updateDetails({ basePrice: Number(event.target.value) })} />
          </label>
          {/* Поля валюты здесь больше нет. Это был свободный текстовый инпут, ни на что не
              влиявший: вписав «EUR», админ показал бы €59.99 при списании $59.99. Валюта
              теперь живёт у самой игры (Game.Currency + прайс-лист) и правится в каталоге. */}
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
          <DateTimeField
            label="Start date"
            value={discount.startDate}
            onChange={(startDate) => setDiscount((prev) => ({ ...prev, gameId: selectedGameId, startDate }))}
          />
          <DateTimeField
            label="End date"
            value={discount.endDate}
            onChange={(endDate) => setDiscount((prev) => ({ ...prev, gameId: selectedGameId, endDate }))}
          />
          <label>
            Active now
            <input className="input" value={discount.isActive ? "Yes" : "No"} readOnly />
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="btn btn-outline" onClick={handleSaveDiscount}>Save discount</button>
          <button className="btn btn-outline" onClick={handleDeleteDiscount}>Delete discount</button>
        </div>
      </CollapsibleCard>



      <CollapsibleCard
        id="editions"
        open={!!openSections["editions"]}
        onToggle={() => toggleSection("editions")}
        title={labels.editions}
        summary={countSummary(details.editions?.length, labels.edition)}
      >
        {renderSectionIssues("editions")}
        {software && (
          <p className="editor-pick__hint">
            Each license is its own offer with its own price, discount and keys. Buyers pick a term and a device count,
            so every license needs at least one of them.
          </p>
        )}
        {details.editions.map((edition, index) => (
          <div key={edition.code} style={{ marginBottom: 12 }}>
            {/* Поля лицензии ПО: из них витрина строит кнопки «срок» и «устройства» и таблицу сравнения. */}
            {software && (
              <div className="license-edit">
                <label className="text-sm">
                  Term
                  <select
                    className="input"
                    value={edition.licenseTermMonths ?? ""}
                    onChange={(event) => updateEdition(index, { licenseTermMonths: event.target.value ? Number(event.target.value) : null })}
                  >
                    {/* Срок из базы вне списка (например, 18 месяцев) не теряем. */}
                    {edition.licenseTermMonths != null && !LICENSE_TERMS.some((term) => term.value === edition.licenseTermMonths) && (
                      <option value={edition.licenseTermMonths}>{edition.licenseTermMonths} months</option>
                    )}
                    {LICENSE_TERMS.map((term) => (
                      <option key={term.label} value={term.value ?? ""}>
                        {term.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Devices
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={edition.licenseDevices ?? ""}
                    placeholder="any"
                    onChange={(event) => updateEdition(index, { licenseDevices: event.target.value ? Math.max(1, Number(event.target.value)) : null })}
                  />
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(edition.isSubscription)}
                    onChange={(event) => updateEdition(index, { isSubscription: event.target.checked })}
                  />
                  Subscription
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="radio"
                    name="default-license"
                    checked={Boolean(edition.isDefault)}
                    onChange={() => updateDetails({ editions: details.editions.map((item, i) => ({ ...item, isDefault: i === index })) })}
                  />
                  Selected by default
                </label>
                <span className="license-edit__label">
                  Store label: <strong>{licenseLabel(edition)}</strong>{" "}
                  {edition.title !== licenseLabel(edition) && (
                    <button type="button" className="btn btn-outline btn-small" onClick={() => updateEdition(index, { title: licenseLabel(edition) })}>
                      Use as title
                    </button>
                  )}
                </span>
                {/* Склад лицензии. Ключи можно заливать только сохранённой: пул привязан к коду, а несохранённого
                    кода сервер ещё не знает. Ключи без кода — запас лицензии по умолчанию, как в каталоге. */}
                {(() => {
                  const saved = (savedDetails?.editions ?? []).filter((item) => item.code);
                  const isSaved = saved.some((item) => item.code === edition.code);
                  if (!isSaved) {
                    return <span className="license-edit__keys is-pending">Save the card to add keys for this license</span>;
                  }
                  const defaultCode = (saved.find((item) => item.isDefault) ?? saved[0])?.code;
                  const isDefault = edition.code === defaultCode;
                  const available = keyStock
                    ? (keyStock[edition.code] ?? 0) + (isDefault ? keyStock[""] ?? 0 : 0)
                    : null;
                  return (
                    <span className={`license-edit__keys${available === 0 ? " is-empty" : ""}`}>
                      Keys in stock: <strong>{available ?? "—"}</strong>
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={() => setKeysFor({ code: isDefault ? "" : edition.code, title: edition.title || licenseLabel(edition) })}
                      >
                        Add keys
                      </button>
                    </span>
                  );
                })()}
              </div>
            )}
            <div className="admin-grid admin-grid--3">
              <label className="text-sm">Title<LocalizedField label="Edition title" i18n={edition.titleI18n} placeholder={edition.title} onI18nChange={(next) => updateEdition(index, { titleI18n: next })}><input className="input" value={edition.title} onChange={(event) => updateEdition(index, { title: event.target.value })} /></LocalizedField></label>
              <label className="text-sm">Description<LocalizedField label="Edition description" i18n={edition.descriptionI18n} placeholder={edition.description} onI18nChange={(next) => updateEdition(index, { descriptionI18n: next })}><input className="input" value={edition.description} onChange={(event) => updateEdition(index, { description: event.target.value })} /></LocalizedField></label>
              <label className="text-sm">Price ({baseCurrency})<input className="input" type="number" value={edition.price} onChange={(event) => updateEdition(index, { price: Number(event.target.value) })} /></label>
            </div>
            {/* Прайс-лист издания по валютам — как у игры: пусто = по курсу от базовой цены издания;
                число = ручная цена, важнее курса. Нет ни того ни другого — издание в валюте не продаётся. */}
            {extraCurrencies.length > 0 && (
              <div className="flex gap-3 flex-wrap" style={{ marginTop: 6 }}>
                {extraCurrencies.map((code) => (
                  <label key={code} className="text-xs text-gray-500" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {code}
                    <input
                      className="input"
                      type="number"
                      step="any"
                      style={{ width: 110 }}
                      placeholder="by rate"
                      value={edition.prices?.[code] ?? ""}
                      onChange={(event) => {
                        const next = { ...(edition.prices ?? {}) };
                        if (event.target.value.trim() === "") {
                          delete next[code];
                        } else {
                          next[code] = Number(event.target.value);
                        }
                        updateEdition(index, { prices: Object.keys(next).length ? next : null });
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <button className="btn btn-outline" onClick={addEdition}>{labels.addEdition}</button>
      </CollapsibleCard>

      <div className="keys-drawer">
        <Drawer isOpen={Boolean(keysFor)} title={keysFor ? `Keys — ${details.title} · ${keysFor.title}` : "Keys"} onClose={closeKeys}>
          {keysFor && (
            <KeyInventorySection
              gameId={details.gameId}
              initialEditionCode={keysFor.code}
              onDirtyChange={(dirty) => {
                keysDirtyRef.current = dirty;
              }}
            />
          )}
        </Drawer>
      </div>

      {!software && (
      <CollapsibleCard id="dlc" open={!!openSections["dlc"]} onToggle={() => toggleSection("dlc")} title="DLC & bundles" summary={countSummary(details.dlcItems?.length, "item")}>
        {renderSectionIssues("dlc")}
        {details.dlcItems.map((dlc, index) => (
          <div key={dlc.id} className="admin-grid admin-grid--3">
            <input className="input" value={dlc.title} onChange={(event) => updateDlc(index, { title: event.target.value })} />
            <input className="input" value={dlc.coverUrl} onChange={(event) => updateDlc(index, { coverUrl: event.target.value })} />
            <input className="input" type="number" value={dlc.price} onChange={(event) => updateDlc(index, { price: Number(event.target.value) })} />
          </div>
        ))}
        <button className="btn btn-outline" onClick={addDlc}>Add DLC</button>
      </CollapsibleCard>
      )}
        </>
      )}

      {(step === "all" || step === "requirements") && (
        <>
      <CollapsibleCard id="sysreq" open={!!openSections["sysreq"]} onToggle={() => toggleSection("sysreq")} title="System requirements" summary={sysreqSummary}>
        {renderSectionIssues("sysreq")}
        <SystemRequirementsEditor
          value={details.systemRequirements}
          onChange={(systemRequirements) => updateDetails({ systemRequirements })}
        />
      </CollapsibleCard>
        </>
      )}

      {(step === "all" || step === "discovery") && (
        <>
      <CollapsibleCard id="featured" open={!!openSections["featured"]} onToggle={() => toggleSection("featured")} title="Featured storefront settings" summary={details.showInFeaturedStorefront ? `featured · priority ${details.featuredStorefrontPriority}` : "not featured"}>
        {renderSectionIssues("featured")}
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
      </CollapsibleCard>

      <CollapsibleCard id="awards" open={!!openSections["awards"]} onToggle={() => toggleSection("awards")} title="Awards" summary={countSummary(details.awards?.length, "award")}>
        {renderSectionIssues("awards")}
        {/* Строка на награду вместо textarea со списком названий. У награды кроме названия
            есть тип, год и значок — витрина их показывает, — а прежнее поле знало только
            название и при каждой правке пересобирало массив, теряя остальное. Пустая строка
            там же превращалась в пустую награду: отсюда «3 awards» при двух видимых. */}
        {(details.awards ?? []).length === 0 && (
          <p className="editor-pick__hint">No awards yet.</p>
        )}
        {(details.awards ?? []).map((award, index) => (
          <div key={index} className="award-edit">
            <label>
              Title
              <LocalizedField label="Award title" i18n={award.titleI18n} placeholder={award.title ?? ""} onI18nChange={(next) => updateAward(index, { titleI18n: next })}>
                <input
                  className="input"
                  value={award.title ?? ""}
                  onChange={(event) => updateAward(index, { title: event.target.value })}
                />
              </LocalizedField>
            </label>
            <label>
              Type
              <input
                className="input"
                placeholder="Game of the Year"
                value={award.type ?? ""}
                onChange={(event) => updateAward(index, { type: event.target.value })}
              />
            </label>
            <label>
              Year
              {/* Список, а не поле ввода: у награды не может быть отрицательного года или
                  года из будущего, а свободный number принимал и «-3», и «99999». */}
              <select
                className="input"
                value={award.year ?? ""}
                onChange={(event) =>
                  updateAward(index, { year: event.target.value ? Number(event.target.value) : undefined })
                }
              >
                <option value="">—</option>
                {/* Значение из базы вне списка (например, старое «-3») показываем отдельным
                    пунктом. Иначе select молча показал бы пустоту, а кривой год остался бы
                    лежать в карточке до тех пор, пока кто-нибудь случайно не тронет поле. */}
                {award.year !== undefined && award.year !== null && !AWARD_YEARS.includes(award.year) && (
                  <option value={award.year}>{award.year} — invalid</option>
                )}
                {AWARD_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-field">
              <span className="field-label">Icon</span>
              <div className="award-edit__icon">
                {award.iconUrl ? (
                  <img src={award.iconUrl} alt="" />
                ) : (
                  // Витрина при пустом значке рисует 🏆 — показываем то же, чтобы админ видел,
                  // как это будет выглядеть, а не пустое место.
                  <span className="award-edit__placeholder" aria-hidden="true">🏆</span>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => {
                    setAwardIconIndex(index);
                    setMediaPickerMode("award");
                    setMediaPickerOpen(true);
                  }}
                >
                  Choose
                </button>
                {award.iconUrl && (
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => updateAward(index, { iconUrl: undefined })}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {/* Обычного размера, а не мелкая: мелкая кнопка вдвое ниже полей и, выровненная
                по нижнему краю, выглядела упавшей вниз. Одинаковая высота ставит её в ряд. */}
            <button type="button" className="btn btn-outline award-edit__remove" onClick={() => removeAward(index)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-outline" onClick={addAward}>Add award</button>
      </CollapsibleCard>


      <CollapsibleCard id="recommendations" open={!!openSections["recommendations"]} onToggle={() => toggleSection("recommendations")} title="Recommendations" summary={details.autoRecommendRules?.enabled ? "automatic" : countSummary(details.similarGameIds?.length, "manual pick")}>
        {renderSectionIssues("recommendations")}
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
      </CollapsibleCard>
        </>
      )}


        </div>

        {descriptionPreview && (
          <aside className="editor-split__preview">
            <GameCardPreview details={details} />
          </aside>
        )}
      </div>

      {/* Внизу справа — две кнопки, которыми пользуются во время правки: посмотреть, что
          получилось, и сохранить. Публикация и статус сюда не входят: это не про процесс
          редактирования, а про то, видят ли карточку покупатели, и живёт отдельным блоком. */}
      <div className="admin-save-bar">
        <button
          type="button"
          className={`btn btn-outline editor-preview-toggle${descriptionPreview ? " is-on" : ""}`}
          aria-pressed={descriptionPreview}
          onClick={() => setDescriptionPreview((value) => !value)}
        >
          {descriptionPreview ? "Hide preview" : "Preview card"}
        </button>
        {/* Число на кнопке — сколько правок уедет на сервер. Раньше кнопка выглядела одинаково
            и при нетронутой форме, и при десятке несохранённых изменений. */}
        <button className="btn btn-primary" onClick={handleSave}>
          {unsavedTotal > 0 ? `Save all (${unsavedTotal})` : "Save all"}
        </button>
      </div>

      <MediaPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        filterType={mediaPickerMode === "gallery" ? "all" : "image"}
        allowMultiple={mediaPickerMode === "gallery"}
        onSelect={(asset) => {
          if (mediaPickerMode === "cover") {
            updateDetails({ cover: { url: asset.url, alt: asset.filename } });
          } else if (mediaPickerMode === "award") {
            if (awardIconIndex !== null) {
              updateAward(awardIconIndex, { iconUrl: asset.url });
            }
            setAwardIconIndex(null);
          } else if (mediaPickerMode === "description") {
            // Подпись по умолчанию — имя файла без расширения: осмысленный alt лучше пустого,
            // а переписать его в тексте админ может сразу же.
            const alt = asset.filename.replace(/\.[^.]+$/, "");
            insertIntoDescription(buildImageSnippet(imageInsertSize, asset.url, alt));
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

import i18n from "../i18n";
import { formatDate } from "../i18n/format";

/** Дата публикации поста на языке сайта; у поста без даты — «Черновик». */
export const formatPostDate = (value?: string): string => (value ? formatDate(value) : i18n.t("common.draft"));

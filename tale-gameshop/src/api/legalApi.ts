import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

/**
 * Реквизиты продавца для юридических документов.
 *
 * Живут в конфигурации сервера (секция "Legal" в appsettings, любое поле перекрывается
 * переменной Legal__Entity), а не в коде витрины: сменить название юрлица, адрес или срок
 * хранения данных должно быть настройкой, а не пересборкой сайта.
 *
 * Список полей — не документация, а источник правды: по нему собран тип, и по нему же тест
 * проверяет, что каждый токен {{...}} в текстах документов существует. Опечатка в токене
 * иначе навсегда осталась бы меткой «не заполнено».
 */
export const LEGAL_FIELDS = [
    "entity",
    "registrationCountry",
    "registrationNumber",
    "address",
    "supportEmail",
    "privacyEmail",
    "governingLawCountry",
    "disputeForum",
    "withdrawalWording",
    "liabilityLimits",
    "dataProtectionOfficer",
    "supervisoryAuthority",
    "dataRequestDays",
    "paymentProvider",
    "identityProvider",
    "emailProvider",
    "hostingProvider",
    "dataTransfers",
    "orderRetention",
    "accountRetention",
    "supportRetention",
    "analyticsRetention",
    "effectiveDate",
] as const;

export type LegalField = (typeof LEGAL_FIELDS)[number];

export type LegalDetails = Record<LegalField, string> & {
    /** Принудительная пометка «черновик»: текст ещё не смотрел юрист. */
    draft: boolean;
};

export const getLegalDetails = async (): Promise<LegalDetails> => {
    const response = await container.get<IApiClient>(IDENTIFIERS.IApiClient).api.get("/api/storefront/legal");
    return response.data as LegalDetails;
};

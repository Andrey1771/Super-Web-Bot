
export interface IAdminService {
    getAllMappedLoginEvents(): Promise<any>;

    /** Окно журнала входов: границы и фильтры считает Keycloak, а не браузер. */
    getLoginEventsPage(options: {
        skip: number;
        take: number;
        type?: string;
        user?: string;
        client?: string;
        dateFrom?: string;
        dateTo?: string;
    }): Promise<any[]>;
}
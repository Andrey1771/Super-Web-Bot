import {AxiosInstance} from "axios";

export interface IApiClient {
    get api(): AxiosInstance;
}
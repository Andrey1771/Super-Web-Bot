import {useCallback} from "react";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type {IUrlService} from "../iterfaces/i-url-service";
import type {IKeycloakService} from "../iterfaces/i-keycloak-service";
import type {BlogEventPayload} from "../iterfaces/i-blog-service";

const ANON_ID_KEY = "tale_anon_id";
const SESSION_ID_KEY = "tale_blog_session_id";
const IMPRESSIONS_KEY = "tale_blog_impressions";
const READ_COMPLETE_KEY = "tale_blog_read_complete";

const impressionCache = new Set<string>();
const readCompleteCache = new Set<string>();

const loadSessionSet = (key: string, target: Set<string>) => {
  if (typeof window === "undefined") {
    return;
  }
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as string[];
    parsed.forEach((value) => target.add(value));
  } catch (error) {
    console.warn("Failed to parse blog session cache", error);
  }
};

const persistSessionSet = (key: string, target: Set<string>) => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(key, JSON.stringify(Array.from(target)));
};

const getOrCreateId = (storage: Storage, key: string) => {
  const existing = storage.getItem(key);
  if (existing) {
    return existing;
  }
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `anon-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  storage.setItem(key, value);
  return value;
};

export const getAnonId = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return getOrCreateId(window.localStorage, ANON_ID_KEY);
};

export const getSessionId = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return getOrCreateId(window.sessionStorage, SESSION_ID_KEY);
};

const ensureCachesLoaded = () => {
  if (impressionCache.size === 0) {
    loadSessionSet(IMPRESSIONS_KEY, impressionCache);
  }
  if (readCompleteCache.size === 0) {
    loadSessionSet(READ_COMPLETE_KEY, readCompleteCache);
  }
};

export const useBlogTracking = () => {
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
  const baseUrl = urlService.apiBaseUrl;

  const sendEvent = useCallback(
    (payload: BlogEventPayload) => {
      const token = keycloakService.keycloak?.token;
      const body = JSON.stringify(payload);
      const endpoint = `${baseUrl}/api/blog/events`;

      if (!token && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], {type: "application/json"});
        navigator.sendBeacon(endpoint, blob);
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? {Authorization: `Bearer ${token}`} : {})
        },
        body,
        keepalive: true
      }).catch((error) => console.warn("Failed to send blog event", error));
    },
    [baseUrl, keycloakService]
  );

  const trackImpression = useCallback(
    (postId: string) => {
      if (!postId) {
        return;
      }
      ensureCachesLoaded();
      if (impressionCache.has(postId)) {
        return;
      }
      impressionCache.add(postId);
      persistSessionSet(IMPRESSIONS_KEY, impressionCache);
      sendEvent({
        postId,
        eventType: "POST_IMPRESSION",
        ts: new Date().toISOString(),
        anonId: getAnonId(),
        sessionId: getSessionId(),
        referrer: typeof window !== "undefined" ? window.location.href : undefined
      });
    },
    [sendEvent]
  );

  const trackOpen = useCallback(
    (postId: string) => {
      if (!postId) {
        return;
      }
      sendEvent({
        postId,
        eventType: "POST_OPEN",
        ts: new Date().toISOString(),
        anonId: getAnonId(),
        sessionId: getSessionId(),
        referrer: typeof window !== "undefined" ? window.location.href : undefined
      });
    },
    [sendEvent]
  );

  const trackReadProgress = useCallback(
    (postId: string, scrollDepth: number, dwellMs: number) => {
      if (!postId) {
        return;
      }
      sendEvent({
        postId,
        eventType: "POST_READ_PROGRESS",
        ts: new Date().toISOString(),
        anonId: getAnonId(),
        sessionId: getSessionId(),
        scrollDepth,
        dwellMs
      });
    },
    [sendEvent]
  );

  const trackReadComplete = useCallback(
    (postId: string, dwellMs: number) => {
      if (!postId) {
        return;
      }
      ensureCachesLoaded();
      if (readCompleteCache.has(postId)) {
        return;
      }
      readCompleteCache.add(postId);
      persistSessionSet(READ_COMPLETE_KEY, readCompleteCache);
      sendEvent({
        postId,
        eventType: "POST_READ_COMPLETE",
        ts: new Date().toISOString(),
        anonId: getAnonId(),
        sessionId: getSessionId(),
        dwellMs
      });
    },
    [sendEvent]
  );

  const trackBookmark = useCallback(
    (postId: string) => {
      if (!postId) {
        return;
      }
      sendEvent({
        postId,
        eventType: "POST_BOOKMARK",
        ts: new Date().toISOString(),
        anonId: getAnonId(),
        sessionId: getSessionId()
      });
    },
    [sendEvent]
  );

  return {
    trackImpression,
    trackOpen,
    trackReadProgress,
    trackReadComplete,
    trackBookmark
  };
};

"use client";

export const TOKEN_KEY = "relateos_auth_token";
export const AUTH_CHANGED_EVENT = "relateos-auth-changed";

export const saveAuthToken = (token: string) => {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
};

export const clearAuthToken = () => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
};

export const resolveApiUrl = () => {
  let url: string;

  if (process.env.NEXT_PUBLIC_API_URL) {
    url = process.env.NEXT_PUBLIC_API_URL;
  } else if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    url = "http://localhost:8000/api/v1";
  } else {
    url = "/_/backend/api/v1";
  }

  if (url && !url.startsWith("http") && !url.startsWith("/")) {
    const normalized = `https://${url.replace(/^\/+/, "")}`;
    url = normalized.endsWith("/api/v1") ? normalized : `${normalized}/api/v1`;
  }

  if (url && !url.startsWith("http") && !url.startsWith("/")) {
    url = "/_/backend/api/v1";
  }

  return url;
};

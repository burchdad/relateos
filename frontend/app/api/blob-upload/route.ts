import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ClientPayload = {
  meetingId?: string;
  apiUrl?: string;
  fileName?: string;
  contentType?: string;
  artifactType?: string;
  fileSizeBytes?: number;
};

const resolveApiUrl = (payload?: ClientPayload) => {
  const raw = payload?.apiUrl || process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "";
  if (!raw) return "";
  if (raw.startsWith("http") || raw.startsWith("/")) return raw;
  const normalized = `https://${raw.replace(/^\/+/, "")}`;
  return normalized.endsWith("/api/v1") ? normalized : `${normalized}/api/v1`;
};

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload || "{}") as ClientPayload;
        if (!payload.meetingId) {
          throw new Error("meetingId is required");
        }

        return {
          allowedContentTypes: ["video/*", "audio/*"],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify(payload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as ClientPayload;
        const apiUrl = resolveApiUrl(payload);
        if (!apiUrl || !payload.meetingId) return;

        await fetch(`${apiUrl}/meetings/${payload.meetingId}/recording-artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifact_type: payload.artifactType || "media",
            file_name: payload.fileName || blob.pathname,
            content_type: payload.contentType || null,
            source_url: blob.url,
            text_content: null,
            file_size_bytes: payload.fileSizeBytes || 0,
            status: "pending_transcription",
            extraction_notes: ["Media uploaded to Vercel Blob. Ready for transcription worker."],
            raw_metadata: {
              source: "vercel_blob",
              blob_url: blob.url,
              blob_pathname: blob.pathname,
              uploaded_at: new Date().toISOString(),
            },
          }),
        });
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

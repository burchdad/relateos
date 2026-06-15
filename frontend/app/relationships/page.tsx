import { redirect } from "next/navigation";

export default function RelationshipsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
    } else if (value) {
      params.set(key, value);
    }
  });
  redirect(`/contacts${params.size ? `?${params.toString()}` : ""}`);
}

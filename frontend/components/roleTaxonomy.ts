export const ROLE_OPTIONS = [
  { value: "sf_buyer", label: "SF Buyer", group: "Single-Family" },
  { value: "sf_seller", label: "SF Seller", group: "Single-Family" },
  { value: "cre_buyer", label: "CRE Buyer", group: "Commercial" },
  { value: "cre_seller", label: "CRE Seller", group: "Commercial" },
  { value: "lp_investor", label: "LP Investor", group: "Capital" },
  { value: "gp_partner", label: "GP Partner", group: "Capital" },
  { value: "operator", label: "Operator", group: "Operating" },
  { value: "vendor", label: "Vendor", group: "Operating" },
  { value: "broker", label: "Broker", group: "Operating" },
  { value: "agent", label: "Agent", group: "Operating" },
  { value: "lender", label: "Lender", group: "Capital" },
  { value: "coach", label: "Coach", group: "Community" },
  { value: "student", label: "Student", group: "Community" },
  { value: "community_member", label: "Community Member", group: "Community" },
  { value: "podcast_guest", label: "Podcast Guest", group: "Community" },
  { value: "influencer", label: "Influencer", group: "Community" },
  { value: "unknown", label: "Unknown", group: "Other" },
];

export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((role) => [role.value, role.label]));

export const ROLE_COLOR_GROUPS: Record<string, string> = {
  sf_buyer: "sf_buyer",
  sf_seller: "sf_seller",
  cre_buyer: "cre_buyer",
  cre_seller: "cre_seller",
  buyer: "buyer",
  seller: "seller",
  lp_investor: "capital",
  gp_partner: "capital",
  investor: "capital",
  partner: "capital",
  lender: "capital",
  operator: "operator",
  broker: "operator",
  agent: "operator",
  vendor: "vendor",
  coach: "community",
  student: "community",
  community_member: "community",
  podcast_guest: "community",
  influencer: "community",
  lead: "other",
  unknown: "other",
};

export const normalizeRoleKey = (value: string | null | undefined) => {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[-\s]+/g, "_");
};

export const formatRole = (role: string | null | undefined) => {
  const normalized = normalizeRoleKey(role);
  if (!normalized) return "-";
  return ROLE_LABELS[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const getRoleColorGroup = (role: {
  color_group?: string | null;
  role?: string | null;
  role_family?: string | null;
  market_segment?: string | null;
}) => {
  const explicit = normalizeRoleKey(role.color_group);
  if (explicit && explicit !== "other") return ROLE_COLOR_GROUPS[explicit] || explicit;

  const roleKey = normalizeRoleKey(role.role);
  if (ROLE_COLOR_GROUPS[roleKey]) return ROLE_COLOR_GROUPS[roleKey];

  if (role.role_family === "buyer" && role.market_segment === "single_family") return "sf_buyer";
  if (role.role_family === "seller" && role.market_segment === "single_family") return "sf_seller";
  if (role.role_family === "buyer" && role.market_segment === "commercial_real_estate") return "cre_buyer";
  if (role.role_family === "seller" && role.market_segment === "commercial_real_estate") return "cre_seller";
  if (role.role_family === "buyer") return "buyer";
  if (role.role_family === "seller") return "seller";

  return "other";
};

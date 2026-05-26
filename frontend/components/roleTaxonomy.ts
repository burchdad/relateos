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

export const formatRole = (role: string | null | undefined) => {
  if (!role) return "-";
  return ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

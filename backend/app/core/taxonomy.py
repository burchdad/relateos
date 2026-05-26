ROLE_TAXONOMY: dict[str, dict[str, str]] = {
    "sf_buyer": {
        "label": "SF Buyer",
        "role_family": "buyer",
        "market_segment": "single_family",
        "color_group": "sf_buyer",
        "message_context": "single-family buyer looking for homes, flips, rentals, or small residential opportunities",
    },
    "sf_seller": {
        "label": "SF Seller",
        "role_family": "seller",
        "market_segment": "single_family",
        "color_group": "sf_seller",
        "message_context": "single-family seller or homeowner with a potential residential property opportunity",
    },
    "cre_buyer": {
        "label": "CRE Buyer",
        "role_family": "buyer",
        "market_segment": "commercial_real_estate",
        "color_group": "cre_buyer",
        "message_context": "commercial real estate buyer focused on multifamily, retail, office, industrial, or investment assets",
    },
    "cre_seller": {
        "label": "CRE Seller",
        "role_family": "seller",
        "market_segment": "commercial_real_estate",
        "color_group": "cre_seller",
        "message_context": "commercial real estate seller, owner, or sponsor with a potential asset to sell or recapitalize",
    },
    "buyer": {
        "label": "Buyer",
        "role_family": "buyer",
        "market_segment": "general",
        "color_group": "buyer",
        "message_context": "buyer with unspecified asset focus",
    },
    "seller": {
        "label": "Seller",
        "role_family": "seller",
        "market_segment": "general",
        "color_group": "seller",
        "message_context": "seller with unspecified asset focus",
    },
}

ROLE_ALIASES = {
    "single family buyer": "sf_buyer",
    "single-family buyer": "sf_buyer",
    "sf buyer": "sf_buyer",
    "sf_buyer": "sf_buyer",
    "residential buyer": "sf_buyer",
    "single family seller": "sf_seller",
    "single-family seller": "sf_seller",
    "sf seller": "sf_seller",
    "sf_seller": "sf_seller",
    "residential seller": "sf_seller",
    "commercial buyer": "cre_buyer",
    "cre buyer": "cre_buyer",
    "cre_buyer": "cre_buyer",
    "commercial real estate buyer": "cre_buyer",
    "commercial seller": "cre_seller",
    "cre seller": "cre_seller",
    "cre_seller": "cre_seller",
    "commercial real estate seller": "cre_seller",
    "lp": "lp_investor",
    "limited partner": "lp_investor",
    "investor": "lp_investor",
    "gp": "gp_partner",
    "general partner": "gp_partner",
    "partner": "gp_partner",
    "capital partner": "gp_partner",
    "real estate agent": "agent",
    "realtor": "agent",
    "vendor partner": "vendor",
}


def normalize_role(role: str | None) -> str | None:
    if not role:
        return None
    cleaned = role.strip().lower().replace("-", " ").replace("_", " ")
    return ROLE_ALIASES.get(cleaned, cleaned.replace(" ", "_"))


def role_metadata(role: str | None) -> dict[str, str]:
    normalized = normalize_role(role)
    if not normalized:
        return {}
    return ROLE_TAXONOMY.get(
        normalized,
        {
            "label": normalized.replace("_", " ").title(),
            "role_family": normalized,
            "market_segment": "general",
            "color_group": normalized,
            "message_context": normalized.replace("_", " "),
        },
    )


def role_label(role: str | None) -> str:
    return role_metadata(role).get("label", "Unknown")

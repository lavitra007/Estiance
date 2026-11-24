import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import streamlit as st
import sklearn.compose._column_transformer as _ct

if not hasattr(_ct, "_RemainderColsList"):
    class _RemainderColsList(list):
        pass
    _ct._RemainderColsList = _RemainderColsList

st.set_page_config(
    page_title="Estiance - Airbnb Dynamic Pricing",
    page_icon="🏠",
    layout="wide",
)

ARTIFACT_DIR = Path(__file__).parent / "artifacts_ml"


@st.cache_resource
def load_artifacts():
    model = joblib.load(ARTIFACT_DIR / "best_price_model.joblib")
    catalog = pd.read_parquet(ARTIFACT_DIR / "listings_catalog.parquet")
    with open(ARTIFACT_DIR / "ui_metadata.json", "r", encoding="utf-8") as f:
        meta = json.load(f)
    hood_coords = (
        catalog.groupby(["neighbourhood_group_cleansed", "neighbourhood_cleansed"])[
            ["latitude", "longitude"]
        ]
        .median()
        .to_dict(orient="index")
    )
    return model, catalog, meta, hood_coords


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2.0) ** 2
    return 2.0 * r * np.arcsin(np.sqrt(a))


price_model, catalog_df, ui_meta, hood_coords = load_artifacts()
defaults = ui_meta["defaults"]
holdout_metrics = ui_meta.get("holdout_metrics", {})
median_ae = float(holdout_metrics.get("holdout_median_ae", 31.34))

st.sidebar.title("Estiance")
st.sidebar.subheader("Listing Parameters")

boroughs = ui_meta["boroughs"]
default_borough_idx = boroughs.index("Manhattan") if "Manhattan" in boroughs else 0
borough = st.sidebar.selectbox("Neighbourhood Group", boroughs, index=default_borough_idx)

hoods = ui_meta["borough_to_neighbourhoods"].get(borough, [])
default_hood_idx = hoods.index("Midtown") if "Midtown" in hoods else 0
neighbourhood = st.sidebar.selectbox("Neighbourhood", hoods, index=default_hood_idx)

room_types = ui_meta["room_types"]
room_type = st.sidebar.selectbox("Room Type", room_types, index=0)

prop_types = ui_meta["property_types"]
property_type = st.sidebar.selectbox("Property Type", prop_types, index=0)

accommodates = st.sidebar.number_input("Accommodates", min_value=1, max_value=16, value=2, step=1)
bedrooms = st.sidebar.number_input("Bedrooms", min_value=0.0, max_value=15.0, value=1.0, step=1.0)
beds = st.sidebar.number_input("Beds", min_value=0.0, max_value=20.0, value=1.0, step=1.0)
bathrooms = st.sidebar.number_input("Bathrooms", min_value=0.5, max_value=10.0, value=1.0, step=0.5)
min_nights = st.sidebar.number_input("Min Nights", min_value=1, max_value=365, value=2, step=1)
amenity_count = st.sidebar.slider("Total Amenity Count", min_value=0, max_value=100, value=25)

with st.sidebar.expander("Key Amenities", expanded=False):
    amen_wifi = int(st.checkbox("Wi-Fi", value=True))
    amen_kitchen = int(st.checkbox("Kitchen", value=(room_type == "Entire home/apt")))
    amen_ac = int(st.checkbox("Air Conditioning", value=True))
    amen_heating = int(st.checkbox("Heating", value=True))
    amen_washer = int(st.checkbox("Washer", value=False))
    amen_dryer = int(st.checkbox("Dryer", value=False))
    amen_tv = int(st.checkbox("TV", value=False))
    amen_self_checkin = int(st.checkbox("Self Check-In", value=False))
    amen_workspace = int(st.checkbox("Dedicated Workspace", value=False))
    amen_parking = int(st.checkbox("Free Parking", value=False))

coords = hood_coords.get((borough, neighbourhood))
if isinstance(coords, dict):
    lat, lon = float(coords["latitude"]), float(coords["longitude"])
else:
    lat, lon = float(defaults["latitude"]), float(defaults["longitude"])

dist_midtown = float(haversine_km(lat, lon, 40.7580, -73.9855))

row = pd.DataFrame([{
    "accommodates": accommodates,
    "bedrooms": bedrooms,
    "bedrooms_missing": 0,
    "beds": beds,
    "bathrooms_clean": bathrooms,
    "minimum_nights": min_nights,
    "max_nights_clean": defaults["max_nights_clean"],
    "amenity_count": amenity_count,
    "cal_avail_rate": defaults["cal_avail_rate"],
    "review_log_count": defaults["review_log_count"],
    "review_scores_rating": defaults["review_scores_rating"],
    "host_is_superhost_bin": defaults["host_is_superhost_bin"],
    "calculated_host_listings_count": defaults["calculated_host_listings_count"],
    "latitude": lat,
    "longitude": lon,
    "dist_midtown_km": dist_midtown,
    "amen_wifi": amen_wifi,
    "amen_kitchen": amen_kitchen,
    "amen_ac": amen_ac,
    "amen_heating": amen_heating,
    "amen_washer": amen_washer,
    "amen_dryer": amen_dryer,
    "amen_tv": amen_tv,
    "amen_self_checkin": amen_self_checkin,
    "amen_workspace": amen_workspace,
    "amen_parking": amen_parking,
    "room_type": room_type,
    "neighbourhood_group_cleansed": borough,
    "property_type_clean": property_type,
}])

pred_log = float(price_model.predict(row)[0])
pred_price = float(np.clip(np.expm1(pred_log), 15.0, 50000.0))
low_price = max(15.0, pred_price - median_ae)
high_price = pred_price + median_ae

top_k = 5
pool = catalog_df[catalog_df["room_type"] == room_type].copy()
pool["geo_km"] = haversine_km(lat, lon, pool["latitude"].values, pool["longitude"].values)
cap_diff = (pool["accommodates"] - accommodates).abs()

t1 = pool[(pool["geo_km"] <= 2.0) & (cap_diff == 0)]
t2 = pool[(pool["geo_km"] <= 5.0) & (cap_diff == 0)]
t3 = pool[(pool["geo_km"] <= 5.0) & (cap_diff <= 1)]

if len(t1) >= top_k:
    cand, tier_used = t1.copy(), "Tier 1 (<=2 km, exact capacity)"
elif len(t2) >= top_k:
    cand, tier_used = t2.copy(), "Tier 2 (<=5 km, exact capacity)"
elif len(t3) >= top_k:
    cand, tier_used = t3.copy(), "Tier 3 (<=5 km, capacity +/-1)"
else:
    cand, tier_used = pool.nsmallest(max(50, top_k * 5), "geo_km").copy(), "Fallback (nearest same room_type)"

sim_geo = np.exp(-cand["geo_km"] / 2.0)
sim_cap = 1.0 / (1.0 + (cand["accommodates"] - accommodates).abs())
sim_prop = (cand["property_type_clean"] == property_type).astype(float)
sim_amen = 1.0 / (1.0 + (cand["amenity_count"] - amenity_count).abs() / 10.0)
sim_hood = (cand["neighbourhood_cleansed"] == neighbourhood).astype(float)

cand["similarity_score"] = (
    0.30 * sim_geo
    + 0.25 * sim_cap
    + 0.15 * sim_prop
    + 0.20 * sim_amen
    + 0.10 * sim_hood
)
cand = cand.sort_values("similarity_score", ascending=False)
diversified = cand.drop_duplicates(subset=["host_id"], keep="first").head(top_k)

comp_prices = diversified["price_num"].values
comp_median = float(np.median(comp_prices)) if len(comp_prices) else 0.0
comp_q25 = float(np.percentile(comp_prices, 25)) if len(comp_prices) else 0.0
comp_q75 = float(np.percentile(comp_prices, 75)) if len(comp_prices) else 0.0

st.title("Estiance")
st.caption("Airbnb Dynamic Price Prediction & Market Comparable Insights")

with st.container(border=True):
    st.markdown("#### Predicted Nightly Price")
    st.markdown(f"# ${pred_price:,.2f}")
    st.write(
        f"**Recommended Fair Range:** ${low_price:,.2f} - ${high_price:,.2f} "
        f"(+/-${median_ae:.2f} Holdout Median AE | Model: `{ui_meta['best_model']}`)"
    )

st.subheader("Market Comparable Insights")
c1, c2, c3 = st.columns(3)
c1.metric("Comparable Tier Used", tier_used.split(" (")[0])
c2.metric("Candidate Pool Size", f"{len(cand):,} listings")
c3.metric(
    "Comparable Median",
    f"${comp_median:,.2f}",
    f"IQR: ${comp_q25:,.0f} - ${comp_q75:,.0f}",
)

st.markdown("#### Top 5 Nearby Comparable Listings (Diverse Host Pool)")
display_df = diversified[[
    "name",
    "neighbourhood_cleansed",
    "room_type",
    "accommodates",
    "geo_km",
    "price_num",
    "similarity_score",
]].copy()
display_df.columns = [
    "Listing Name",
    "Neighbourhood",
    "Room Type",
    "Accommodates",
    "Distance (km)",
    "Price/Night ($)",
    "Similarity (%)",
]
display_df["Distance (km)"] = display_df["Distance (km)"].round(2)
display_df["Price/Night ($)"] = display_df["Price/Night ($)"].round(2)
display_df["Similarity (%)"] = (display_df["Similarity (%)"] * 100).round(1)
st.dataframe(display_df, use_container_width=True, hide_index=True)

with st.expander("Model Benchmark (5-Fold GroupKFold CV Leaderboard)"):
    st.dataframe(
        pd.DataFrame(ui_meta.get("cv_leaderboard", [])),
        use_container_width=True,
        hide_index=True,
    )

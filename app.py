import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
import sklearn.compose._column_transformer as _ct

# Preserve sklearn pickle compatibility
if not hasattr(_ct, "_RemainderColsList"):
    class _RemainderColsList(list):
        pass
    _ct._RemainderColsList = _RemainderColsList

st.set_page_config(
    page_title="Estiance | Airbnb Dynamic Pricing",
    page_icon="🏠",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Load custom editorial CSS
CSS_PATH = Path(__file__).parent / "styles.css"
if CSS_PATH.exists():
    st.markdown(f"<style>{CSS_PATH.read_text(encoding='utf-8')}</style>", unsafe_allow_html=True)

ARTIFACT_DIR = Path(__file__).parent / "artifacts_ml"

AMENITY_MAP = {
    "amen_wifi": ("Wi-Fi", True),
    "amen_kitchen": ("Kitchen", True),
    "amen_ac": ("Air Conditioning", True),
    "amen_heating": ("Heating", True),
    "amen_washer": ("Washer", False),
    "amen_dryer": ("Dryer", False),
    "amen_tv": ("TV", False),
    "amen_self_checkin": ("Self Check-In", False),
    "amen_workspace": ("Dedicated Workspace", False),
    "amen_parking": ("Free Parking", False),
}


@st.cache_resource
def load_artifacts():
    model = joblib.load(ARTIFACT_DIR / "best_price_model.joblib")
    catalog = pd.read_parquet(ARTIFACT_DIR / "listings_catalog.parquet")
    with open(ARTIFACT_DIR / "ui_metadata.json", "r", encoding="utf-8") as f:
        meta = json.load(f)

    metrics_path = ARTIFACT_DIR / "model_metrics.json"
    metrics = None
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            metrics = json.load(f)

    hood_coords = (
        catalog.groupby(["neighbourhood_group_cleansed", "neighbourhood_cleansed"])[
            ["latitude", "longitude"]
        ]
        .median()
        .to_dict(orient="index")
    )
    return model, catalog, meta, metrics, hood_coords


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2.0) ** 2
    return 2.0 * r * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def build_feature_row(
    borough, room_type, property_type, accommodates, bedrooms, beds,
    bathrooms, min_nights, amenity_count, lat, lon, amen_values, defaults
):
    dist_midtown = float(haversine_km(lat, lon, 40.7580, -73.9855))
    return pd.DataFrame([{
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
        "amen_wifi": amen_values["amen_wifi"],
        "amen_kitchen": amen_values["amen_kitchen"],
        "amen_ac": amen_values["amen_ac"],
        "amen_heating": amen_values["amen_heating"],
        "amen_washer": amen_values["amen_washer"],
        "amen_dryer": amen_values["amen_dryer"],
        "amen_tv": amen_values["amen_tv"],
        "amen_self_checkin": amen_values["amen_self_checkin"],
        "amen_workspace": amen_values["amen_workspace"],
        "amen_parking": amen_values["amen_parking"],
        "room_type": room_type,
        "neighbourhood_group_cleansed": borough,
        "property_type_clean": property_type,
    }])


def predict_rate(model, row_df):
    pred_log = float(model.predict(row_df)[0])
    return float(np.clip(np.expm1(pred_log), 15.0, 50000.0))


def get_tiered_comps(
    catalog_df, lat, lon, room_type, property_type, neighbourhood,
    accommodates, amenity_count, top_k=5, max_radius_km=None, dedup_host=True
):
    pool = catalog_df[catalog_df["room_type"] == room_type].copy()
    pool["geo_km"] = haversine_km(lat, lon, pool["latitude"].values, pool["longitude"].values)
    cap_diff = (pool["accommodates"] - accommodates).abs()

    if max_radius_km is not None:
        cand = pool[pool["geo_km"] <= max_radius_km].copy()
        tier_used = f"Custom Radius (<= {max_radius_km:.2f} km)"
        if cand.empty:
            cand = pool.nsmallest(max(30, top_k * 3), "geo_km").copy()
            tier_used = "Fallback (nearest same room_type)"
    else:
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

    raw_pool_count = len(cand)
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

    if dedup_host and "host_id" in cand.columns:
        deduped = cand.drop_duplicates(subset=["host_id"], keep="first")
    else:
        deduped = cand

    unique_pool_count = len(deduped)
    return deduped.head(top_k), tier_used, raw_pool_count, unique_pool_count


price_model, catalog_df, ui_meta, model_metrics, hood_coords = load_artifacts()
defaults = ui_meta["defaults"]
holdout_metrics = ui_meta.get("holdout_metrics", {})
median_ae = float(holdout_metrics.get("holdout_median_ae", 31.34))

# -----------------------------------------------------------------------------
# TOP HEADER & NAVIGATION
# -----------------------------------------------------------------------------
st.markdown(
    f"""
    <div class="top-pill-bar">
        <div>
            <span class="brand-mark">ESTIANCE</span>
            <span class="brand-sub">NYC SHORT-TERM RENTAL PRICING ENGINE | {len(catalog_df):,} LISTINGS</span>
        </div>
        <div class="brand-sub">MODEL: {ui_meta.get('best_model', 'CatBoost')}</div>
    </div>
    """,
    unsafe_allow_html=True,
)

nav = st.segmented_control(
    "Navigation",
    options=["Pricing Studio", "Comps Dossier", "Market Analytics", "Model Validation"],
    default="Pricing Studio",
    label_visibility="collapsed",
)

# Shared session state defaults
boroughs = ui_meta["boroughs"]
if "borough" not in st.session_state:
    st.session_state.borough = "Manhattan" if "Manhattan" in boroughs else boroughs[0]
hoods = ui_meta["borough_to_neighbourhoods"].get(st.session_state.borough, [])
if "neighbourhood" not in st.session_state or st.session_state.neighbourhood not in hoods:
    st.session_state.neighbourhood = "Midtown" if "Midtown" in hoods else hoods[0]
if "room_type" not in st.session_state:
    st.session_state.room_type = ui_meta["room_types"][0]
if "property_type" not in st.session_state:
    st.session_state.property_type = ui_meta["property_types"][0]

# -----------------------------------------------------------------------------
# TAB 1: PRICING STUDIO
# -----------------------------------------------------------------------------
if nav == "Pricing Studio":
    st.markdown('<div class="eyebrow">LIVE CATBOOST INFERENCE | WHAT-IF SIMULATOR</div>', unsafe_allow_html=True)
    st.markdown('<div class="hero-title">Data-driven nightly pricing. <i>Grounded in local comps.</i></div>', unsafe_allow_html=True)

    with st.container(border=True):
        c1, c2, c3, c4 = st.columns([1.3, 1.6, 1.3, 1.3])
        with c1:
            borough = st.selectbox("Neighbourhood Group", boroughs, index=boroughs.index(st.session_state.borough))
            st.session_state.borough = borough
        hoods = ui_meta["borough_to_neighbourhoods"].get(borough, [])
        if st.session_state.neighbourhood not in hoods:
            st.session_state.neighbourhood = hoods[0]
        with c2:
            neighbourhood = st.selectbox("Neighbourhood", hoods, index=hoods.index(st.session_state.neighbourhood))
            st.session_state.neighbourhood = neighbourhood
        with c3:
            room_type = st.selectbox("Room Type", ui_meta["room_types"], index=ui_meta["room_types"].index(st.session_state.room_type))
            st.session_state.room_type = room_type
        with c4:
            property_type = st.selectbox("Property Type", ui_meta["property_types"], index=ui_meta["property_types"].index(st.session_state.property_type))
            st.session_state.property_type = property_type

        c5, c6, c7, c8, c9, c10 = st.columns([1, 1, 1, 1, 1, 1.6])
        accommodates = c5.number_input("Guests", min_value=1, max_value=16, value=2, step=1)
        bedrooms = c6.number_input("Bedrooms", min_value=0.0, max_value=15.0, value=1.0, step=1.0)
        beds = c7.number_input("Beds", min_value=0.0, max_value=20.0, value=1.0, step=1.0)
        bathrooms = c8.number_input("Bathrooms", min_value=0.5, max_value=10.0, value=1.0, step=0.5)
        min_nights = c9.number_input("Min Nights", min_value=1, max_value=365, value=2, step=1)
        amenity_count = c10.slider("Total Amenity Count", min_value=0, max_value=100, value=25)

        st.caption("Key Amenities (Real Model Features)")
        amen_cols = st.columns(5)
        amen_values = {}
        for idx, (col_key, (label, default_val)) in enumerate(AMENITY_MAP.items()):
            init_val = (room_type == "Entire home/apt") if col_key == "amen_kitchen" else default_val
            with amen_cols[idx % 5]:
                amen_values[col_key] = int(st.toggle(label, value=init_val, key=f"studio_{col_key}"))

    coords = hood_coords.get((borough, neighbourhood))
    lat, lon = (float(coords["latitude"]), float(coords["longitude"])) if isinstance(coords, dict) else (float(defaults["latitude"]), float(defaults["longitude"]))

    row_df = build_feature_row(
        borough, room_type, property_type, accommodates, bedrooms, beds,
        bathrooms, min_nights, amenity_count, lat, lon, amen_values, defaults
    )
    pred_price = predict_rate(price_model, row_df)

    if model_metrics and "fair_range_low_mult" in model_metrics and "fair_range_high_mult" in model_metrics:
        low_price = max(15.0, pred_price * model_metrics["fair_range_low_mult"])
        high_price = pred_price * model_metrics["fair_range_high_mult"]
        band_note = f"Empirical holdout interval ({model_metrics.get('calibrated_coverage_pct', '')}% coverage)"
    else:
        low_price = max(15.0, pred_price - median_ae)
        high_price = pred_price + median_ae
        band_note = f"+/- ${median_ae:.2f} Holdout Median AE"

    comps_df, tier_used, raw_pool, uniq_pool = get_tiered_comps(
        catalog_df, lat, lon, room_type, property_type, neighbourhood,
        accommodates, amenity_count, top_k=8, dedup_host=True
    )
    comp_median = float(comps_df["price_num"].median()) if len(comps_df) else 0.0

    left, right = st.columns([1.1, 1.9], gap="large")
    with left:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="card-kicker">PREDICTED NIGHTLY PRICE</div>
                <div class="card-value" style="font-size:3.1rem; color:#D96B38;">${pred_price:,.2f}<span style="font-size:1rem; color:#7A756C;"> / night</span></div>
                <div class="card-sub">Fair Range: <b>${low_price:,.2f} to ${high_price:,.2f}</b></div>
                <div class="card-sub">{band_note}</div>
                <hr style="border:none; border-top:1px solid #E8E3D9; margin:0.85rem 0;">
                <div class="card-sub">Comparable Median: <b>${comp_median:,.2f} / night</b></div>
                <div class="card-sub">Tier Used: {tier_used}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # Live counterfactual amenity deltas
        st.markdown("##### Live Amenity Marginal Impact ($/night)")
        deltas = []
        for col_key, (label, _) in AMENITY_MAP.items():
            row_on = row_df.copy()
            row_off = row_df.copy()
            row_on[col_key] = 1
            row_off[col_key] = 0
            diff = predict_rate(price_model, row_on) - predict_rate(price_model, row_off)
            deltas.append({"Amenity": label, "Marginal $/Night": round(diff, 2)})
        st.dataframe(pd.DataFrame(deltas).sort_values("Marginal $/Night", ascending=False), use_container_width=True, hide_index=True)

    with right:
        st.markdown("##### Nearby Host-Deduplicated Comparables Map")
        map_df = comps_df[["latitude", "longitude", "price_num", "geo_km", "similarity_score", "name"]].copy()
        map_df["similarity_pct"] = (map_df["similarity_score"] * 100).round(1)
        fig_map = px.scatter_map(
            map_df,
            lat="latitude",
            lon="longitude",
            color="price_num",
            size="similarity_pct",
            hover_name="name",
            hover_data={"price_num": ":$.0f", "geo_km": ":.2f", "similarity_pct": True, "latitude": False, "longitude": False},
            color_continuous_scale=["#141413", "#D96B38"],
            zoom=12.5,
            height=410,
        )
        fig_map.update_layout(map_style="carto-positron", margin=dict(l=0, r=0, t=0, b=0), paper_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig_map, use_container_width=True)

        export_df = comps_df.copy()
        export_df.insert(0, "estiance_predicted_rate", round(pred_price, 2))
        st.download_button(
            "Export Pricing & Comps (.csv)",
            data=export_df.to_csv(index=False).encode("utf-8"),
            file_name=f"estiance_{neighbourhood.lower().replace(' ', '_')}_pricing.csv",
            mime="text/csv",
        )

# -----------------------------------------------------------------------------
# TAB 2: COMPS DOSSIER
# -----------------------------------------------------------------------------
elif nav == "Comps Dossier":
    borough = st.session_state.borough
    neighbourhood = st.session_state.neighbourhood
    room_type = st.session_state.room_type
    property_type = st.session_state.property_type

    coords = hood_coords.get((borough, neighbourhood))
    lat, lon = (float(coords["latitude"]), float(coords["longitude"])) if isinstance(coords, dict) else (float(defaults["latitude"]), float(defaults["longitude"]))

    st.markdown('<div class="eyebrow">GEOSPATIAL NEIGHBORHOOD INTEL | HOST-DEDUPLICATED</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="hero-title">{neighbourhood} Comps. <i>No duplicates.</i></div>', unsafe_allow_html=True)

    f1, f2, f3, f4 = st.columns([1.2, 1.5, 1, 1.3])
    dedup_on = f1.toggle("Max 1 Listing / Host", value=True)
    radius_km = f2.slider("Proximity Radius (km)", 0.5, 5.0, 2.0, 0.25)
    min_guests = f3.number_input("Target Guests", 1, 16, 2)
    top_n = f4.selectbox("Comps to Display", [6, 9, 12], index=0)

    comps_df, tier_used, raw_pool, uniq_pool = get_tiered_comps(
        catalog_df, lat, lon, room_type, property_type, neighbourhood,
        min_guests, 25, top_k=top_n, max_radius_km=radius_km, dedup_host=dedup_on
    )

    dedup_ratio = (uniq_pool / raw_pool * 100.0) if raw_pool > 0 else 100.0
    hidden_dups = max(0, raw_pool - uniq_pool)

    k1, k2, k3, k4 = st.columns(4)
    k1.markdown(f'<div class="metric-card"><div class="card-kicker">01 / AVG COMP RATE</div><div class="card-value">${comps_df["price_num"].mean():,.0f}</div><div class="card-sub">Spread: ${comps_df["price_num"].min():,.0f} to ${comps_df["price_num"].max():,.0f}</div></div>', unsafe_allow_html=True)
    k2.markdown(f'<div class="metric-card"><div class="card-kicker">02 / MEDIAN DISTANCE</div><div class="card-value">{comps_df["geo_km"].median():.2f} km</div><div class="card-sub">Haversine within {radius_km:.2f} km</div></div>', unsafe_allow_html=True)
    k3.markdown(f'<div class="metric-card"><div class="card-kicker">03 / UNIQUE HOST RATIO</div><div class="card-value">{dedup_ratio:.1f}%</div><div class="card-sub">{uniq_pool} unique / {raw_pool} raw units</div></div>', unsafe_allow_html=True)
    k4.markdown(f'<div class="metric-card"><div class="card-kicker">04 / FILTER POSTURE</div><div class="card-value" style="font-size:1.35rem;">{"Deduplication Active" if dedup_on else "Raw Pool"}</div><div class="card-sub">{hidden_dups} multi-listing units hidden</div></div>', unsafe_allow_html=True)

    st.write("")
    cols = st.columns(3)
    for i, (_, r) in enumerate(comps_df.iterrows()):
        with cols[i % 3]:
            st.markdown(
                f"""
                <div class="comp-card">
                    <span class="comp-badge">{r['similarity_score']*100:.1f}% Match</span>
                    <div class="comp-title">{str(r['name'])[:52]}</div>
                    <div class="comp-meta">{r['room_type']} | {int(r['accommodates'])} Guests | {r['geo_km']:.2f} km</div>
                    <div style="margin-top:0.65rem; font-size:1.35rem; font-weight:700; color:#D96B38;">${r['price_num']:,.0f} <span style="font-size:0.75rem; color:#7A756C;">/ night</span></div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.download_button(
        "Export Clean Comps Dossier (.csv)",
        data=comps_df.to_csv(index=False).encode("utf-8"),
        file_name=f"estiance_comps_{neighbourhood.lower().replace(' ', '_')}.csv",
        mime="text/csv",
    )

# -----------------------------------------------------------------------------
# TAB 3: MARKET ANALYTICS
# -----------------------------------------------------------------------------
elif nav == "Market Analytics":
    neighbourhood = st.session_state.neighbourhood
    sub = catalog_df[catalog_df["neighbourhood_cleansed"] == neighbourhood].copy()

    st.markdown('<div class="eyebrow">SUBMARKET LENS | INSIDE AIRBNB NYC</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="hero-title">{neighbourhood}. <i>Rate Intelligence.</i></div>', unsafe_allow_html=True)

    p25, p50, p75, p90 = sub["price_num"].quantile([0.25, 0.50, 0.75, 0.90])
    k1, k2, k3, k4 = st.columns(4)
    k1.markdown(f'<div class="metric-card"><div class="card-kicker">01 / MEDIAN RATE (P50)</div><div class="card-value">${p50:,.0f}</div><div class="card-sub">P25: ${p25:,.0f} / night</div></div>', unsafe_allow_html=True)
    k2.markdown(f'<div class="metric-card"><div class="card-kicker">02 / TOP QUARTILE (P75)</div><div class="card-value">${p75:,.0f}</div><div class="card-sub">P90: ${p90:,.0f} / night</div></div>', unsafe_allow_html=True)
    k3.markdown(f'<div class="metric-card"><div class="card-kicker">03 / ACTIVE LISTINGS</div><div class="card-value">{len(sub):,}</div><div class="card-sub">Mean Rate: ${sub["price_num"].mean():,.0f}</div></div>', unsafe_allow_html=True)
    k4.markdown(f'<div class="metric-card"><div class="card-kicker">04 / DISTRIBUTION SKEW</div><div class="card-value">{float(sub["price_num"].skew()):.2f}</div><div class="card-sub">Std Dev: ${sub["price_num"].std():,.0f}</div></div>', unsafe_allow_html=True)

    st.write("")
    c_l, c_r = st.columns([1.4, 1])
    with c_l:
        st.markdown("##### 01 / Nightly Rate Distribution")
        fig_dist = px.histogram(sub, x="price_num", nbins=30, color_discrete_sequence=["#D96B38"])
        fig_dist.add_vline(x=p50, line_dash="dash", line_color="#141413", annotation_text=f"Median ${p50:,.0f}")
        fig_dist.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", margin=dict(l=10, r=10, t=20, b=10))
        st.plotly_chart(fig_dist, use_container_width=True)

    with c_r:
        st.markdown("##### 02 / Room Type Median Comparison")
        rt_df = sub.groupby("room_type")["price_num"].median().reset_index().sort_values("price_num", ascending=False)
        fig_rt = px.bar(rt_df, x="room_type", y="price_num", color_discrete_sequence=["#141413"])
        fig_rt.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", margin=dict(l=10, r=10, t=20, b=10))
        st.plotly_chart(fig_rt, use_container_width=True)

    c_b1, c_b2 = st.columns([1.4, 1])
    with c_b1:
        st.markdown("##### 03 / Price-per-Guest Scaling Curve")
        cap_df = sub[sub["accommodates"].between(1, 8)].groupby("accommodates")["price_num"].median().reset_index()
        fig_cap = px.line(cap_df, x="accommodates", y="price_num", markers=True, color_discrete_sequence=["#D96B38"])
        fig_cap.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", margin=dict(l=10, r=10, t=20, b=10))
        st.plotly_chart(fig_cap, use_container_width=True)

    with c_b2:
        st.markdown("##### 04 / Host Operator Segmentation")
        host_counts = sub["host_id"].value_counts()
        single_pct = float((host_counts == 1).sum() / len(host_counts) * 100.0) if len(host_counts) else 0.0
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="card-kicker">REAL HOST DISTRIBUTION ({len(host_counts):,} HOSTS)</div>
                <div class="card-value">{single_pct:.1f}% <span style="font-size:0.9rem; color:#7A756C;">Single-Listing</span></div>
                <div class="card-sub">Multi-Unit Operators (2+ listings): <b>{100.0 - single_pct:.1f}%</b></div>
            </div>
            """,
            unsafe_allow_html=True,
        )

# -----------------------------------------------------------------------------
# TAB 4: MODEL VALIDATION
# -----------------------------------------------------------------------------
elif nav == "Model Validation":
    st.markdown('<div class="eyebrow">HOST-ISOLATED CATBOOST REGRESSION | AUDITABLE METRICS</div>', unsafe_allow_html=True)
    st.markdown('<div class="hero-title">29 signals. <i>Zero host leakage.</i></div>', unsafe_allow_html=True)

    if model_metrics:
        k1, k2, k3, k4 = st.columns(4)
        k1.markdown(f'<div class="metric-card"><div class="card-kicker">01 / GROUPKFOLD CV RMSE</div><div class="card-value">{model_metrics["cv_log_rmse"]:.4f}</div><div class="card-sub">5-Fold GroupKFold (log space)</div></div>', unsafe_allow_html=True)
        k2.markdown(f'<div class="metric-card"><div class="card-kicker">02 / HOLDOUT R-SQUARED</div><div class="card-value">{model_metrics["holdout_r2"]:.4f}</div><div class="card-sub">0.00% host overlap verified</div></div>', unsafe_allow_html=True)
        k3.markdown(f'<div class="metric-card"><div class="card-kicker">03 / MEDIAN ABS % ERROR</div><div class="card-value">{model_metrics["holdout_mdape_pct"]:.1f}%</div><div class="card-sub">Holdout MAE: ${model_metrics["holdout_mae_usd"]:,.2f}</div></div>', unsafe_allow_html=True)
        k4.markdown(f'<div class="metric-card-dark"><div class="card-kicker" style="color:#A8A39B;">04 / CALIBRATED COVERAGE</div><div class="card-value-dark">{model_metrics["calibrated_coverage_pct"]:.1f}%</div><div class="card-sub" style="color:#D96B38;">Empirical holdout interval</div></div>', unsafe_allow_html=True)

        st.write("")
        v1, v2 = st.columns([1.2, 1])
        with v1:
            st.markdown("##### 05 / Global Feature Importance (%)")
            fi_df = pd.DataFrame(model_metrics["feature_importances"])
            fig_fi = px.bar(fi_df.iloc[::-1], x="pct", y="feature", orientation="h", color_discrete_sequence=["#D96B38"])
            fig_fi.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", margin=dict(l=10, r=10, t=10, b=10))
            st.plotly_chart(fig_fi, use_container_width=True)

        with v2:
            st.markdown("##### 06 / Holdout Residual Distribution (Log Space)")
            rh = model_metrics["residual_hist"]
            mids = [(rh["edges"][i] + rh["edges"][i + 1]) / 2.0 for i in range(len(rh["counts"]))]
            fig_res = go.Figure(go.Bar(x=mids, y=rh["counts"], marker_color="#141413"))
            fig_res.add_vline(x=rh["mean"], line_color="#D96B38", line_dash="dash", annotation_text=f"Mean {rh['mean']}")
            fig_res.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", margin=dict(l=10, r=10, t=10, b=10))
            st.plotly_chart(fig_res, use_container_width=True)
    else:
        st.info("Place artifacts_ml/model_metrics.json in artifacts_ml/ to display the full residual and feature importance charts.")

    st.markdown("##### 07 / 8-Model Host-Grouped CV Leaderboard")
    leaderboard = ui_meta.get("cv_leaderboard", [])
    if not leaderboard and model_metrics:
        leaderboard = model_metrics.get("benchmark_models", [])
    st.dataframe(pd.DataFrame(leaderboard), use_container_width=True, hide_index=True)

    st.markdown("##### 08 / Production Inference Snippet")
    st.code(
        '''import joblib
import numpy as np

model = joblib.load("artifacts_ml/best_price_model.joblib")

def predict_nightly_rate(features_df):
    pred_log = float(model.predict(features_df)[0])
    return round(float(np.clip(np.expm1(pred_log), 15.0, 50000.0)), 2)
''',
        language="python",
    )
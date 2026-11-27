import json
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
import sklearn.compose._column_transformer as _ct
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Preserve sklearn pickle compatibility with 1.6.1 serialized pipeline
if not hasattr(_ct, "_RemainderColsList"):
    class _RemainderColsList(list):
        pass

    _ct._RemainderColsList = _RemainderColsList

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = BASE_DIR / "artifacts_ml"

FEATURE_COLUMNS: List[str] = [
    "accommodates",
    "bedrooms",
    "bedrooms_missing",
    "beds",
    "bathrooms_clean",
    "minimum_nights",
    "max_nights_clean",
    "amenity_count",
    "cal_avail_rate",
    "review_log_count",
    "review_scores_rating",
    "host_is_superhost_bin",
    "calculated_host_listings_count",
    "latitude",
    "longitude",
    "dist_midtown_km",
    "amen_wifi",
    "amen_kitchen",
    "amen_ac",
    "amen_heating",
    "amen_washer",
    "amen_dryer",
    "amen_tv",
    "amen_self_checkin",
    "amen_workspace",
    "amen_parking",
    "room_type",
    "neighbourhood_group_cleansed",
    "property_type_clean",
]

AMENITY_MAP = {
    "amen_wifi": ("Wi-Fi", True, "Core Connectivity"),
    "amen_kitchen": ("Kitchen", True, "Culinary Setup"),
    "amen_ac": ("Air Conditioning", True, "Climate Control"),
    "amen_heating": ("Heating", True, "Climate Control"),
    "amen_washer": ("Washer", False, "In-Unit Utility"),
    "amen_dryer": ("Dryer", False, "In-Unit Utility"),
    "amen_tv": ("TV", False, "Entertainment"),
    "amen_self_checkin": ("Self Check-In", False, "Arrival Access"),
    "amen_workspace": ("Dedicated Workspace", False, "Remote Work"),
    "amen_parking": ("Free Parking", False, "Transit & Auto"),
}


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2.0) ** 2
    return 2.0 * r * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def load_artifacts():
    model = joblib.load(ARTIFACT_DIR / "best_price_model.joblib")
    catalog = pd.read_parquet(ARTIFACT_DIR / "listings_catalog.parquet")
    with open(ARTIFACT_DIR / "ui_metadata.json", "r", encoding="utf-8") as f:
        ui_meta = json.load(f)
    with open(ARTIFACT_DIR / "model_metrics.json", "r", encoding="utf-8") as f:
        model_metrics = json.load(f)

    # Verify exact 29-feature match against serialized pipeline
    model_features = list(getattr(model, "feature_names_in_", FEATURE_COLUMNS))
    if model_features != FEATURE_COLUMNS:
        raise RuntimeError(
            f"Feature schema mismatch: expected {FEATURE_COLUMNS}, got {model_features}"
        )

    hood_coords_df = (
        catalog.groupby(["neighbourhood_group_cleansed", "neighbourhood_cleansed"])[
            ["latitude", "longitude"]
        ]
        .median()
    )
    hood_coords: Dict[str, Dict[str, Dict[str, float]]] = {}
    for (borough, hood), row in hood_coords_df.iterrows():
        hood_coords.setdefault(borough, {})[hood] = {
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
        }

    borough_coords_df = catalog.groupby("neighbourhood_group_cleansed")[
        ["latitude", "longitude"]
    ].median()
    borough_coords: Dict[str, Dict[str, float]] = {
        borough: {
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
        }
        for borough, row in borough_coords_df.iterrows()
    }

    return model, catalog, ui_meta, model_metrics, hood_coords, borough_coords, model_features


(
    price_model,
    catalog_df,
    ui_meta,
    model_metrics,
    hood_coords,
    borough_coords,
    model_features,
) = load_artifacts()
defaults = ui_meta["defaults"]
holdout_metrics = ui_meta.get("holdout_metrics", {})


def build_feature_row(
    borough: str,
    room_type: str,
    property_type: str,
    accommodates: int,
    bedrooms: float,
    beds: float,
    bathrooms: float,
    min_nights: int,
    amenity_count: int,
    lat: float,
    lon: float,
    amen_values: Dict[str, int],
) -> pd.DataFrame:
    dist_midtown = float(haversine_km(lat, lon, 40.7580, -73.9855))
    row = {
        "accommodates": float(accommodates),
        "bedrooms": float(bedrooms),
        "bedrooms_missing": 0,
        "beds": float(beds),
        "bathrooms_clean": float(bathrooms),
        "minimum_nights": float(min_nights),
        "max_nights_clean": float(defaults["max_nights_clean"]),
        "amenity_count": float(amenity_count),
        "cal_avail_rate": float(defaults["cal_avail_rate"]),
        "review_log_count": float(defaults["review_log_count"]),
        "review_scores_rating": float(defaults["review_scores_rating"]),
        "host_is_superhost_bin": int(defaults["host_is_superhost_bin"]),
        "calculated_host_listings_count": float(defaults["calculated_host_listings_count"]),
        "latitude": float(lat),
        "longitude": float(lon),
        "dist_midtown_km": dist_midtown,
        "amen_wifi": int(amen_values["amen_wifi"]),
        "amen_kitchen": int(amen_values["amen_kitchen"]),
        "amen_ac": int(amen_values["amen_ac"]),
        "amen_heating": int(amen_values["amen_heating"]),
        "amen_washer": int(amen_values["amen_washer"]),
        "amen_dryer": int(amen_values["amen_dryer"]),
        "amen_tv": int(amen_values["amen_tv"]),
        "amen_self_checkin": int(amen_values["amen_self_checkin"]),
        "amen_workspace": int(amen_values["amen_workspace"]),
        "amen_parking": int(amen_values["amen_parking"]),
        "room_type": room_type,
        "neighbourhood_group_cleansed": borough,
        "property_type_clean": property_type,
    }
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)


def predict_rate(row_df: pd.DataFrame) -> float:
    pred_log = float(price_model.predict(row_df)[0])
    return float(np.clip(np.expm1(pred_log), 15.0, 50000.0))


def predict_batch(rows_df: pd.DataFrame) -> np.ndarray:
    preds_log = price_model.predict(rows_df[FEATURE_COLUMNS])
    return np.clip(np.expm1(preds_log), 15.0, 50000.0)


def get_tiered_comps(
    lat: float,
    lon: float,
    room_type: str,
    property_type: str,
    neighbourhood: str,
    accommodates: int,
    amenity_count: int,
    top_k: int = 8,
    max_radius_km: Optional[float] = None,
    dedup_host: bool = True,
):
    pool = catalog_df[catalog_df["room_type"] == room_type].copy()
    if pool.empty:
        pool = catalog_df.copy()

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
            cand = pool.nsmallest(max(50, top_k * 5), "geo_km").copy()
            tier_used = "Fallback (nearest same room_type)"

    raw_pool_count = int(len(cand))
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

    unique_pool_count = int(cand["host_id"].nunique()) if "host_id" in cand.columns else int(len(cand))
    return deduped.head(top_k), tier_used, raw_pool_count, unique_pool_count


def _clean_float(val, digits: Optional[int] = None) -> Optional[float]:
    if val is None or pd.isna(val):
        return None
    f = float(val)
    if np.isnan(f) or np.isinf(f):
        return None
    return round(f, digits) if digits is not None else f


def _clean_int(val, fallback: Optional[int] = None) -> Optional[int]:
    if val is None or pd.isna(val):
        return fallback
    return int(val)


def resolve_coords(borough: str, neighbourhood: str) -> tuple[float, float]:
    b_map = hood_coords.get(borough, {})
    if neighbourhood in b_map:
        c = b_map[neighbourhood]
        return float(c["latitude"]), float(c["longitude"])
    if borough in borough_coords:
        c = borough_coords[borough]
        return float(c["latitude"]), float(c["longitude"])
    return float(defaults["latitude"]), float(defaults["longitude"])


class PredictRequest(BaseModel):
    borough: str = "Manhattan"
    neighbourhood: str = "Midtown"
    room_type: str = "Entire home/apt"
    property_type: Optional[str] = None
    accommodates: int = Field(default=2, ge=1, le=16)
    bedrooms: float = Field(default=1.0, ge=0.0, le=15.0)
    beds: float = Field(default=1.0, ge=0.0, le=20.0)
    bathrooms: float = Field(default=1.0, ge=0.5, le=10.0)
    min_nights: int = Field(default=30, ge=1, le=365)
    amenity_count: int = Field(default=31, ge=0, le=100)
    amenities: Optional[Dict[str, int]] = None
    top_k: int = Field(default=8, ge=1, le=50)
    max_radius_km: Optional[float] = Field(default=None, ge=0.25, le=25.0)
    dedup_host: bool = True


app = FastAPI(title="Estiance Pricing Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/meta")
def get_meta():
    amenity_defs = [
        {
            "key": k,
            "label": label,
            "default_enabled": default_val,
            "category": category,
        }
        for k, (label, default_val, category) in AMENITY_MAP.items()
    ]
    return {
        "model_version": ui_meta.get("model_version"),
        "best_model": ui_meta.get("best_model"),
        "target_transform": ui_meta.get("target_transform"),
        "feature_count": len(model_features),
        "feature_names": model_features,
        "catalog_count": int(len(catalog_df)),
        "unique_hosts": int(catalog_df["host_id"].nunique()),
        "boroughs": ui_meta["boroughs"],
        "borough_to_neighbourhoods": ui_meta["borough_to_neighbourhoods"],
        "room_types": ui_meta["room_types"],
        "property_types": ui_meta["property_types"],
        "defaults": defaults,
        "amenity_definitions": amenity_defs,
        "hood_coords": hood_coords,
        "holdout_metrics": holdout_metrics,
        "validation_summary": {
            "cv_log_rmse": model_metrics.get("cv_log_rmse"),
            "holdout_r2": model_metrics.get("holdout_r2"),
            "holdout_mae_usd": model_metrics.get("holdout_mae_usd"),
            "holdout_mdape_pct": model_metrics.get("holdout_mdape_pct"),
            "calibrated_coverage_pct": model_metrics.get("calibrated_coverage_pct"),
            "data_funnel": model_metrics.get("data_funnel"),
        },
    }


@app.post("/api/predict")
def predict_endpoint(req: PredictRequest):
    if req.borough not in ui_meta["boroughs"]:
        raise HTTPException(status_code=400, detail=f"Unknown borough: {req.borough}")
    valid_hoods = ui_meta["borough_to_neighbourhoods"].get(req.borough, [])
    if req.neighbourhood not in valid_hoods:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown neighbourhood '{req.neighbourhood}' for borough '{req.borough}'",
        )
    if req.room_type not in ui_meta["room_types"]:
        raise HTTPException(status_code=400, detail=f"Unknown room_type: {req.room_type}")

    property_type = req.property_type or (
        "Entire rental unit"
        if req.room_type == "Entire home/apt"
        and "Entire rental unit" in ui_meta["property_types"]
        else ui_meta["property_types"][0]
    )
    if property_type not in ui_meta["property_types"]:
        raise HTTPException(status_code=400, detail=f"Unknown property_type: {property_type}")

    amen_values: Dict[str, int] = {}
    incoming_amen = req.amenities or {}
    for col_key, (_, default_val, _) in AMENITY_MAP.items():
        if col_key in incoming_amen:
            amen_values[col_key] = 1 if int(incoming_amen[col_key]) else 0
        else:
            init_val = (
                (req.room_type == "Entire home/apt")
                if col_key == "amen_kitchen"
                else default_val
            )
            amen_values[col_key] = int(init_val)

    lat, lon = resolve_coords(req.borough, req.neighbourhood)
    row_df = build_feature_row(
        borough=req.borough,
        room_type=req.room_type,
        property_type=property_type,
        accommodates=req.accommodates,
        bedrooms=req.bedrooms,
        beds=req.beds,
        bathrooms=req.bathrooms,
        min_nights=req.min_nights,
        amenity_count=req.amenity_count,
        lat=lat,
        lon=lon,
        amen_values=amen_values,
    )

    pred_price = predict_rate(row_df)

    # Calibrated empirical holdout interval from model_metrics.json
    low_mult = float(model_metrics.get("fair_range_low_mult", 0.6693))
    high_mult = float(model_metrics.get("fair_range_high_mult", 1.5726))
    low_price = max(15.0, pred_price * low_mult)
    high_price = pred_price * high_mult
    coverage_pct = float(model_metrics.get("calibrated_coverage_pct", 79.7))

    # Batch-evaluate all 20 counterfactual amenity toggles (on vs off for each of 10 amenities)
    batch_rows = []
    amen_keys = list(AMENITY_MAP.keys())
    for col_key in amen_keys:
        row_on = row_df.iloc[0].copy()
        row_off = row_df.iloc[0].copy()
        row_on[col_key] = 1
        row_off[col_key] = 0
        batch_rows.append(row_on)
        batch_rows.append(row_off)

    # Also compute real baseline counterfactuals for attribution cards:
    # 1. Borough baseline (borough median coordinates, 1 guest, 1 bed, 1 bath, all tracked amenities 0)
    b_coords = borough_coords.get(req.borough, {"latitude": lat, "longitude": lon})
    base_amen_zero = {k: 0 for k in amen_keys}
    row_borough_base = build_feature_row(
        borough=req.borough,
        room_type=req.room_type,
        property_type=property_type,
        accommodates=1,
        bedrooms=1.0,
        beds=1.0,
        bathrooms=1.0,
        min_nights=req.min_nights,
        amenity_count=req.amenity_count,
        lat=b_coords["latitude"],
        lon=b_coords["longitude"],
        amen_values=base_amen_zero,
    ).iloc[0]
    row_hood_loc = build_feature_row(
        borough=req.borough,
        room_type=req.room_type,
        property_type=property_type,
        accommodates=1,
        bedrooms=1.0,
        beds=1.0,
        bathrooms=1.0,
        min_nights=req.min_nights,
        amenity_count=req.amenity_count,
        lat=lat,
        lon=lon,
        amen_values=base_amen_zero,
    ).iloc[0]
    row_with_cap = build_feature_row(
        borough=req.borough,
        room_type=req.room_type,
        property_type=property_type,
        accommodates=req.accommodates,
        bedrooms=req.bedrooms,
        beds=req.beds,
        bathrooms=req.bathrooms,
        min_nights=req.min_nights,
        amenity_count=req.amenity_count,
        lat=lat,
        lon=lon,
        amen_values=base_amen_zero,
    ).iloc[0]

    batch_rows.extend([row_borough_base, row_hood_loc, row_with_cap])
    batch_df = pd.DataFrame(batch_rows, columns=FEATURE_COLUMNS)
    batch_preds = predict_batch(batch_df)

    amenity_deltas = []
    for idx, col_key in enumerate(amen_keys):
        label, _, category = AMENITY_MAP[col_key]
        price_on = float(batch_preds[2 * idx])
        price_off = float(batch_preds[2 * idx + 1])
        amenity_deltas.append(
            {
                "key": col_key,
                "label": label,
                "category": category,
                "enabled": bool(amen_values[col_key]),
                "delta_usd": round(price_on - price_off, 2),
                "price_with": round(price_on, 2),
                "price_without": round(price_off, 2),
            }
        )
    amenity_deltas.sort(key=lambda x: x["delta_usd"], reverse=True)

    p_borough_base = float(batch_preds[2 * len(amen_keys)])
    p_hood_loc = float(batch_preds[2 * len(amen_keys) + 1])
    p_with_cap = float(batch_preds[2 * len(amen_keys) + 2])

    # Tiered Haversine host-deduplicated comparables
    comps_df, tier_used, raw_pool_count, unique_pool_count = get_tiered_comps(
        lat=lat,
        lon=lon,
        room_type=req.room_type,
        property_type=property_type,
        neighbourhood=req.neighbourhood,
        accommodates=req.accommodates,
        amenity_count=req.amenity_count,
        top_k=req.top_k,
        max_radius_km=req.max_radius_km,
        dedup_host=req.dedup_host,
    )

    comps_list = []
    for _, r in comps_df.iterrows():
        comps_list.append(
            {
                "id": _clean_int(r["id"], 0),
                "host_id": _clean_int(r["host_id"], 0),
                "name": str(r["name"]) if pd.notna(r["name"]) else "Untitled Listing",
                "borough": str(r["neighbourhood_group_cleansed"]),
                "neighbourhood": str(r["neighbourhood_cleansed"]),
                "room_type": str(r["room_type"]),
                "property_type": str(r["property_type_clean"]),
                "accommodates": _clean_int(r["accommodates"], 1),
                "bedrooms": _clean_float(r["bedrooms"], 1),
                "beds": _clean_float(r["beds"], 1),
                "bathrooms": _clean_float(r["bathrooms_clean"], 1),
                "amenity_count": _clean_int(r["amenity_count"], 0),
                "latitude": _clean_float(r["latitude"], 6),
                "longitude": _clean_float(r["longitude"], 6),
                "price_num": _clean_float(r["price_num"], 2),
                "geo_km": _clean_float(r["geo_km"], 2),
                "similarity_score": _clean_float(r["similarity_score"], 4),
                "similarity_pct": round(float(r["similarity_score"]) * 100.0, 1),
            }
        )

    if len(comps_df) > 0:
        comp_median = round(float(comps_df["price_num"].median()), 2)
        comp_avg = round(float(comps_df["price_num"].mean()), 2)
        comp_min = round(float(comps_df["price_num"].min()), 2)
        comp_max = round(float(comps_df["price_num"].max()), 2)
        comp_med_dist = round(float(comps_df["geo_km"].median()), 2)
    else:
        comp_median = comp_avg = comp_min = comp_max = comp_med_dist = 0.0

    dedup_ratio_pct = round(
        (unique_pool_count / raw_pool_count * 100.0) if raw_pool_count > 0 else 100.0, 1
    )
    hidden_duplicates = max(0, raw_pool_count - unique_pool_count)

    return {
        "predicted_price": round(pred_price, 2),
        "fair_range": {
            "low": round(low_price, 2),
            "high": round(high_price, 2),
            "low_mult": low_mult,
            "high_mult": high_mult,
            "calibrated_coverage_pct": coverage_pct,
            "band_note": f"Empirical holdout interval ({coverage_pct:.1f}% coverage)",
        },
        "subject": {
            "borough": req.borough,
            "neighbourhood": req.neighbourhood,
            "room_type": req.room_type,
            "property_type": property_type,
            "accommodates": req.accommodates,
            "bedrooms": req.bedrooms,
            "beds": req.beds,
            "bathrooms": req.bathrooms,
            "min_nights": req.min_nights,
            "amenity_count": req.amenity_count,
            "amenities": amen_values,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "dist_midtown_km": round(float(row_df.iloc[0]["dist_midtown_km"]), 2),
        },
        "counterfactual_breakdown": {
            "borough_baseline_usd": round(p_borough_base, 2),
            "neighbourhood_delta_usd": round(p_hood_loc - p_borough_base, 2),
            "capacity_layout_delta_usd": round(p_with_cap - p_hood_loc, 2),
            "active_amenities_delta_usd": round(pred_price - p_with_cap, 2),
        },
        "amenity_deltas": amenity_deltas,
        "comps": comps_list,
        "comps_meta": {
            "tier_used": tier_used,
            "raw_pool_count": raw_pool_count,
            "unique_pool_count": unique_pool_count,
            "dedup_ratio_pct": dedup_ratio_pct,
            "hidden_duplicates": hidden_duplicates,
            "comp_median_price": comp_median,
            "comp_avg_price": comp_avg,
            "comp_min_price": comp_min,
            "comp_max_price": comp_max,
            "comp_median_distance_km": comp_med_dist,
            "dedup_active": req.dedup_host,
        },
    }


@app.get("/api/market/{neighbourhood}")
def get_market(
    neighbourhood: str,
    borough: Optional[str] = Query(default=None),
):
    sub = catalog_df[catalog_df["neighbourhood_cleansed"] == neighbourhood]
    if borough:
        sub_b = sub[sub["neighbourhood_group_cleansed"] == borough]
        if not sub_b.empty:
            sub = sub_b
    if sub.empty:
        raise HTTPException(
            status_code=404, detail=f"No listings found for neighbourhood: {neighbourhood}"
        )

    prices = sub["price_num"].astype(float)
    q25, q50, q75, q90 = prices.quantile([0.25, 0.50, 0.75, 0.90]).tolist()
    skew_val = float(prices.skew()) if len(prices) > 2 else 0.0
    std_val = float(prices.std()) if len(prices) > 1 else 0.0

    # Real histogram clipped at 98th percentile for readable distribution bins
    p98 = float(prices.quantile(0.98))
    hist_prices = prices[prices <= max(p98, q90)]
    counts, edges = np.histogram(hist_prices, bins=24)
    histogram = [
        {
            "bin_start": round(float(edges[i]), 2),
            "bin_end": round(float(edges[i + 1]), 2),
            "mid": round(float((edges[i] + edges[i + 1]) / 2.0), 2),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]

    rt_grouped = (
        sub.groupby("room_type")["price_num"]
        .agg(["median", "mean", "count"])
        .reset_index()
        .sort_values("median", ascending=False)
    )
    room_type_medians = [
        {
            "room_type": str(r["room_type"]),
            "median_price": round(float(r["median"]), 2),
            "mean_price": round(float(r["mean"]), 2),
            "count": int(r["count"]),
        }
        for _, r in rt_grouped.iterrows()
    ]

    cap_sub = sub[sub["accommodates"].between(1, 8)]
    cap_grouped = (
        cap_sub.groupby("accommodates")["price_num"]
        .agg(["median", "mean", "count"])
        .reset_index()
        .sort_values("accommodates")
    )
    capacity_curve = [
        {
            "accommodates": int(r["accommodates"]),
            "median_price": round(float(r["median"]), 2),
            "mean_price": round(float(r["mean"]), 2),
            "price_per_guest": round(float(r["median"]) / int(r["accommodates"]), 2),
            "count": int(r["count"]),
        }
        for _, r in cap_grouped.iterrows()
    ]

    host_counts = sub["host_id"].value_counts()
    total_hosts = int(len(host_counts))
    single_hosts = int((host_counts == 1).sum())
    multi_hosts = int((host_counts > 1).sum())
    single_host_ids = set(host_counts[host_counts == 1].index)
    is_single_listing = sub["host_id"].isin(single_host_ids)
    single_listings_count = int(is_single_listing.sum())
    multi_listings_count = int((~is_single_listing).sum())
    single_median = (
        round(float(sub.loc[is_single_listing, "price_num"].median()), 2)
        if single_listings_count > 0
        else 0.0
    )
    multi_median = (
        round(float(sub.loc[~is_single_listing, "price_num"].median()), 2)
        if multi_listings_count > 0
        else 0.0
    )

    return {
        "neighbourhood": neighbourhood,
        "borough": str(sub["neighbourhood_group_cleansed"].mode().iloc[0]),
        "listing_count": int(len(sub)),
        "quantiles": {
            "p25": round(float(q25), 2),
            "p50": round(float(q50), 2),
            "p75": round(float(q75), 2),
            "p90": round(float(q90), 2),
            "mean": round(float(prices.mean()), 2),
            "std": round(0.0 if np.isnan(std_val) else std_val, 2),
            "skew": round(0.0 if np.isnan(skew_val) else skew_val, 2),
            "min": round(float(prices.min()), 2),
            "max": round(float(prices.max()), 2),
        },
        "histogram": histogram,
        "room_type_medians": room_type_medians,
        "capacity_curve": capacity_curve,
        "host_segmentation": {
            "total_hosts": total_hosts,
            "single_listing_hosts": single_hosts,
            "multi_unit_hosts": multi_hosts,
            "single_host_pct": round(
                (single_hosts / total_hosts * 100.0) if total_hosts else 0.0, 1
            ),
            "multi_host_pct": round(
                (multi_hosts / total_hosts * 100.0) if total_hosts else 0.0, 1
            ),
            "single_listings_count": single_listings_count,
            "multi_listings_count": multi_listings_count,
            "single_median_price": single_median,
            "multi_median_price": multi_median,
        },
    }


@app.get("/api/validation")
def get_validation():
    leaderboard = ui_meta.get("cv_leaderboard", []) or model_metrics.get(
        "benchmark_models", []
    )
    rh = model_metrics.get("residual_hist", {})
    edges = rh.get("edges", [])
    counts = rh.get("counts", [])
    residual_bins = [
        {
            "bin_start": round(float(edges[i]), 3),
            "bin_end": round(float(edges[i + 1]), 3),
            "mid": round(float((edges[i] + edges[i + 1]) / 2.0), 3),
            "count": int(counts[i]),
        }
        for i in range(min(len(counts), max(0, len(edges) - 1)))
    ]

    inference_snippet = '''import joblib
import numpy as np
import sklearn.compose._column_transformer as _ct

if not hasattr(_ct, "_RemainderColsList"):
    class _RemainderColsList(list):
        pass
    _ct._RemainderColsList = _RemainderColsList

model = joblib.load("artifacts_ml/best_price_model.joblib")

def predict_nightly_rate(features_df):
    # Inverse log1p transformation clipped to [15, 50000]
    pred_log = float(model.predict(features_df)[0])
    dollar_price = float(np.clip(np.expm1(pred_log), 15.0, 50000.0))
    return {
        "point_estimate": round(dollar_price, 2),
        "calibrated_fair_range": [
            round(max(15.0, dollar_price * 0.6693), 2),
            round(dollar_price * 1.5726, 2),
        ],
    }'''

    return {
        **model_metrics,
        "residual_bins": residual_bins,
        "cv_leaderboard": leaderboard,
        "inference_snippet": inference_snippet,
        "feature_names": model_features,
    }

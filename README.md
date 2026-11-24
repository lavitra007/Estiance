# Estiance

Estiance predicts optimal nightly rates and surfaces host-diversified market comparables across NYC short-term rental listings. Built on Inside Airbnb data (21,515 listings, 990,170 reviews, and chunked calendar availability), the system combines a 29-feature CatBoost pipeline trained on `log1p(price)` with a multi-tier Haversine similarity engine to deliver calibrated pricing bands and real-time comp benchmarks.

## Key Engineering Highlights
- **Leakage-Free Validation:** Enforces strict host-level isolation via `GroupShuffleSplit` and 5-fold `GroupKFold` cross-validation (zero host overlap between train and validation folds).
- **Regression Architecture:** Benchmarked 8 regression architectures against a median baseline; CatBoost achieved a 5-fold CV MAE of $101.49 (vs. $177.31 baseline) and an untouched holdout Median AE of $31.34 ($51.92 MAE across the <= $750 core segment).
- **Tiered Geospatial Comps:** Retrieves nearby listings using progressive Haversine radius and capacity tiers, scoring candidates across geographic decay, capacity delta, property type, amenity overlap, and neighborhood match with host deduplication.
- **Interactive Inference UI:** Deployed as a Streamlit application providing real-time price predictions, holdout-calibrated fair ranges, comp interquartile spreads, and interactive amenity toggles.

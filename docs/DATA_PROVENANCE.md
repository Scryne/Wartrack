# WARTRACKER — DATA PROVENANCE, ETHICS & BENCHMARK LINEAGE

## 1. Data Ingestion Ethics & RSS Attribution

WARTRACKER operates strictly as an aggregator and situation room intelligence analyzer:
- **Direct Attribution**: Every ingested tactical event retains explicit metadata linking to the originating publisher (`source`, `link`, `guid`).
- **Fair Use & Summarization**: Full-text articles are not stored indefinitely; only title snippets, excerpts, and tactical entities are retained for intelligence clustering.
- **Outbound Link Safety**: Third-party feed URLs are sanitized via `toSafeHref` to protect operators from hostile redirection schemes.

---

## 2. Benchmark Dataset Provenance & Non-Circularity

To ensure scientific validity in intelligence engine evaluations, the evaluation benchmark (`backend/test/datasets/corroboration_holdout_dataset.ts`) adheres to strict provenance standards:

### 2.1 Provenance Principles:
1. **Independent Curation**: All 75 pairwise evaluation cases were manually curated using actual regional OSINT conflict reports (Middle East Levant, Red Sea, Black Sea, Persian Gulf, Eastern Europe).
2. **Non-Circularity**: Test cases were constructed completely independently from the tokenizer's internal synonym mapping to eliminate circular evaluation bias.
3. **Partition Isolation**: Test cases are divided into 6 explicit partitions (`dev`, `val`, `holdout`, `adversarial`, `edge-case`, `ood`) to evaluate generalization across unseen data and novel tactical domains.

---

## 3. Gazetteer & Geographic Lineage

Geocoding resolution (`backend/src/services/geoExtract.service.ts`) maps tactical entities to verified geographical coordinates based on open-source geographic gazetteers:
- Damascus ($33.5138^\circ\text{ N}, 36.2765^\circ\text{ E}$)
- Beirut ($33.8886^\circ\text{ N}, 35.4955^\circ\text{ E}$)
- Isfahan ($32.6546^\circ\text{ N}, 51.6680^\circ\text{ E}$)
- Tehran ($35.6892^\circ\text{ N}, 51.3890^\circ\text{ E}$)
- Aleppo ($36.2021^\circ\text{ N}, 37.1343^\circ\text{ E}$)
- Eilat ($29.5581^\circ\text{ N}, 34.9482^\circ\text{ E}$)
- Tel Aviv ($32.0853^\circ\text{ N}, 34.7818^\circ\text{ E}$)
- Hodeidah ($14.7978^\circ\text{ N}, 42.9545^\circ\text{ E}$)
- Gaza City ($31.5167^\circ\text{ N}, 34.4500^\circ\text{ E}$)

All coordinates are verified within valid terrestrial bounds $[-90, 90]$ and $[-180, 180]$ and protected by database CHECK constraints.

# WARTRACKER — PERFORMANCE, LATENCY & SCALABILITY BENCHMARKS

## 1. Benchmarking Methodology

All benchmarks were conducted using reproducible automated test suites:
1. `backend/test/performance_benchmark.test.ts`: Scale tests across 100, 1,000, 3,000, and 10,000 synthetic event datasets.
2. `backend/test/soak_simulation.test.ts`: 10,000-cycle accelerated operational soak test tracking heap growth, worker wedging, and WAL behavior.

---

## 2. Benchmark Results Summary

### 2.1 Latency vs Event Volume (SQLite WAL Engine)

| Event Dataset Size | Database Seeding | Event Query Latency (p50) | Event Query Latency (p95) | Event Query Latency (p99) | Clustering (24 clusters) | Threat Engine avg | SitRep Endpoint avg | Online Backup Time | Memory RSS | Heap Used |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **100 Events** | 2.33 ms | **0.09 ms** | 0.20 ms | 0.32 ms | 7.04 ms | 4.53 ms | 19.33 ms | 31.89 ms | 120.5 MB | 26.5 MB |
| **1,000 Events** | 9.84 ms | **0.09 ms** | 0.24 ms | 0.33 ms | 36.22 ms | 35.91 ms | 67.81 ms | 21.21 ms | 155.7 MB | 42.8 MB |
| **3,000 Events** | 15.34 ms | **0.05 ms** | 0.07 ms | 0.15 ms | 63.41 ms | 70.37 ms | 137.95 ms | 19.14 ms | 226.4 MB | 38.3 MB |
| **10,000 Events** | 90.11 ms | **0.10 ms** | 0.13 ms | 0.22 ms | 272.66 ms | 274.68 ms | 468.58 ms | 22.76 ms | 289.1 MB | 96.0 MB |

### Key Observations:
- **Sub-Millisecond Query Latency**: Database query p50 remains flat at $\le 0.10\text{ ms}$ regardless of dataset size due to SQLite B-tree indexing on `created_at` and `severity`.
- **Fast Online Backups**: Backup duration is consistent at $\sim 20-30\text{ ms}$ for 10,000 records without blocking database operations.

---

## 3. Long-Running Operational Soak Results

The 10,000 accelerated operational cycle soak simulation verified:
- **Total Operational Cycles**: 10,000
- **Net Heap Memory Delta**: $+0.84\text{ MB}$ (proving steady state garbage collection without memory leaks).
- **Wedged Workers**: 0 (summarization queue and feed workers remained 100% responsive under simulated fault injection).
- **WAL Checkpointing**: WAL file maintained within healthy size boundaries.

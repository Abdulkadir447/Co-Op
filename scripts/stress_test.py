"""
Co-op load harness — "how long will it last?"

Drives a REAL running server over HTTP (no shortcuts, no in-process app) and
reports where the write and read paths start to hurt as data grows.

    # 1. start a server against a throwaway database
    COOP_ENV=testing COOP_TEST_AUTH_USER=stress-owner \
      DATABASE_URL=sqlite+aiosqlite:////tmp/stress.db \
      .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

    # 2. from another shell
    .venv/bin/python scripts/stress_test.py --customers 1000 --products 1000

    # a short smoke run
    .venv/bin/python scripts/stress_test.py --customers 50 --products 50

`COOP_TEST_AUTH_USER` is refused outright in production (backend/clerk_auth.py),
so this can never be pointed at live data by accident.

What it measures, in order:

  1. writes      — sequential POST /customers and POST /products, one request
                   at a time (that is what a person typing does), then the same
                   volume concurrently (what a bulk paste or a sync push does).
  2. reads       — list pages, search, single record, dashboard briefing and
                   the sales report, re-measured after every batch so you can
                   see the trend as the table grows instead of one snapshot.
  3. import      — commits samples/imports/products-large.csv and
                   orders-large.csv when they exist (make_fixtures.py --rows N).

Caveat that matters: these numbers are for the database the server was started
against. SQLite on a laptop is not Postgres on Supabase — treat the shape of
the curve as the answer, and re-run the script against staging for the real
figure.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import statistics
import sys
import time

import httpx

DEFAULT_BASE = "http://127.0.0.1:8000"
REPORT = pathlib.Path("stress-report.json")


def pct(samples: list[float], p: float) -> float:
    if not samples:
        return 0.0
    s = sorted(samples)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


def summarise(label: str, samples: list[float], errors: list[str], started: float) -> dict:
    wall = time.perf_counter() - started
    n = len(samples)
    out = {
        "label": label,
        "count": n,
        "errors": len(errors),
        "wall_seconds": round(wall, 3),
        "per_second": round(n / wall, 1) if wall else 0.0,
        "p50_ms": round(pct(samples, 50), 1),
        "p95_ms": round(pct(samples, 95), 1),
        "p99_ms": round(pct(samples, 99), 1),
        "max_ms": round(max(samples), 1) if samples else 0.0,
    }
    print(
        f"  {label:<34} n={n:<5} {out['per_second']:>7}/s  "
        f"p50={out['p50_ms']:>7}ms p95={out['p95_ms']:>7}ms max={out['max_ms']:>7}ms "
        f"err={out['errors']}"
    )
    if errors:
        print(f"      first error: {errors[0][:160]}")
    return out


async def timed(client: httpx.AsyncClient, method: str, url: str, **kw):
    """Return (elapsed_ms, response). Never raises — errors are counted."""
    t = time.perf_counter()
    try:
        r = await client.request(method, url, **kw)
    except httpx.HTTPError as e:
        return (time.perf_counter() - t) * 1000, e
    return (time.perf_counter() - t) * 1000, r


async def create_rows(
    client: httpx.AsyncClient,
    kind: str,
    start: int,
    count: int,
    concurrency: int = 1,
) -> tuple[list[float], list[str]]:
    samples: list[float] = []
    errors: list[str] = []

    def payload(i: int) -> tuple[str, dict]:
        if kind == "customers":
            return "/customers", {
                "full_name": f"Stress Customer {i:06d}",
                "email": f"stress.customer.{i:06d}@imported.coop",
                "phone": "+234 800 000 0000",
                "company": f"Stress Co {i % 97}",
                "address": f"{i % 200} Ahmadu Bello Way, Kano",
            }
        return "/products", {
            "sku": f"STR-{i:06d}",
            "name": f"Stress Product {i:06d}",
            "description": "created by scripts/stress_test.py",
            "category": f"Cat {i % 23}",
            "unit_price": round(500 + (i % 400) * 12.5, 2),
            "cost_price": round(400 + (i % 400) * 9.0, 2),
            "current_stock": i % 300,
            "reorder_level": 5 + i % 20,
        }

    async def one(i: int) -> None:
        url, body = payload(i)
        ms, r = await timed(client, "POST", url, json=body)
        if isinstance(r, Exception) or r.status_code not in (200, 201):
            detail = str(r) if isinstance(r, Exception) else f"{r.status_code} {r.text[:120]}"
            errors.append(detail)
        else:
            samples.append(ms)

    if concurrency <= 1:
        for i in range(start, start + count):
            await one(i)
    else:
        sem = asyncio.Semaphore(concurrency)

        async def guarded(i: int) -> None:
            async with sem:
                await one(i)

        await asyncio.gather(*(guarded(i) for i in range(start, start + count)))
    return samples, errors


async def measure_reads(client: httpx.AsyncClient, tag: str) -> list[dict]:
    print(f"\nreads @{tag}")
    probes = [
        ("GET /customers?limit=50", "/customers", {"limit": 50}),
        ("GET /customers?limit=50&page=5", "/customers", {"limit": 50, "page": 5}),
        ("GET /customers?search=stress", "/customers", {"search": "stress", "limit": 50}),
        ("GET /products?limit=50", "/products", {"limit": 50}),
        ("GET /products?search=stress", "/products", {"search": "stress", "limit": 50}),
        ("GET /orders?limit=50", "/orders", {"limit": 50}),
        ("GET /dashboard/summary", "/dashboard/summary", {}),
        ("GET /dashboard/revenue/timeseries", "/dashboard/revenue/timeseries", {}),
        ("GET /dashboard/briefing", "/dashboard/briefing", {}),
        ("GET /reports/sales", "/reports/sales", {"from": "2026-01-01", "to": "2026-12-31"}),
        ("GET /inventory/summary", "/inventory/summary", {}),
    ]
    out = []
    for label, path, params in probes:
        samples = []
        errors = []
        started = time.perf_counter()
        for _ in range(10):  # 10 reps: enough for a stable p95, cheap enough to repeat
            ms, r = await timed(client, "GET", path, params=params)
            if isinstance(r, Exception) or r.status_code >= 400:
                errors.append(str(r) if isinstance(r, Exception) else f"{r.status_code} {r.text[:80]}")
            else:
                samples.append(ms)
        out.append(summarise(label, samples, errors, started))
    return out


async def import_files(client: httpx.AsyncClient) -> list[dict]:
    out = []
    folder = pathlib.Path("samples/imports")
    for name, entity in (("products-large.csv", "products"), ("orders-large.csv", "orders")):
        path = folder / name
        if not path.exists():
            print(f"\nimport: {name} not present (make_fixtures.py --rows N) — skipped")
            continue
        data = path.read_bytes()
        print(f"\nimport {name} ({len(data) / 1024:.0f} KB, entity={entity})")
        mapping = "{}"
        prev = await client.post("/imports/preview", files={"file": (name, data)})
        if prev.status_code != 200:
            print(f"  preview failed: {prev.status_code} {prev.text[:120]}")
            continue
        body = prev.json()
        mp = await client.post(
            "/imports/map",
            json={"entity": entity, "headers": body["columns"], "sample_rows": body["sample_rows"]},
        )
        if mp.status_code == 200:
            mapping = json.dumps(
                {m["column"]: m["field"] for m in mp.json()["mappings"] if m["field"]}
            )

        t = time.perf_counter()
        r = await client.post(
            "/imports/commit",
            files={"file": (name, data)},
            data={"entity": entity, "mapping": mapping},
        )
        wall = time.perf_counter() - t
        if r.status_code != 200:
            print(f"  commit failed: {r.status_code} {r.text[:200]}")
            out.append({"label": f"import {name}", "error": r.text[:200]})
            continue
        j = r.json()
        rows = j["total_rows"]
        print(
            f"  {rows} rows in {wall:.2f}s ({rows / wall:.0f} rows/s) "
            f"created={j['created']} skipped={j['skipped']} errors={j['skipped']['errors']}"
        )
        out.append(
            {
                "label": f"import {name}",
                "rows": rows,
                "wall_seconds": round(wall, 2),
                "rows_per_second": round(rows / wall, 1),
                "created": j["created"],
                "skipped": j["skipped"],
            }
        )
    return out


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--customers", type=int, default=200, help="customers to create per batch")
    ap.add_argument("--products", type=int, default=200, help="products to create per batch")
    ap.add_argument("--batches", type=int, default=3, help="how many batches (grows the tables)")
    ap.add_argument("--concurrency", type=int, default=10, help="parallel writers in the burst phase")
    ap.add_argument("--skip-import", action="store_true")
    args = ap.parse_args()

    report: dict = {"base_url": args.base_url, "phases": [], "started": time.strftime("%Y-%m-%d %H:%M:%S")}
    headers = {"Authorization": "Bearer stress"}

    async with httpx.AsyncClient(base_url=args.base_url, headers=headers, timeout=120.0) as client:
        try:
            health = await client.get("/")
        except httpx.HTTPError as e:
            print(f"cannot reach {args.base_url}: {e}")
            print(__doc__)
            return 2
        print(f"server: {args.base_url} ({health.status_code})")

        next_customer = 0
        next_product = 0
        for batch in range(1, args.batches + 1):
            print(f"\n=== batch {batch}/{args.batches}: +{args.customers} customers, +{args.products} products ===")

            started = time.perf_counter()
            s, e = await create_rows(client, "customers", next_customer, args.customers)
            report["phases"].append(summarise(f"POST /customers (batch {batch})", s, e, started))
            next_customer += args.customers

            started = time.perf_counter()
            s, e = await create_rows(client, "products", next_product, args.products)
            report["phases"].append(summarise(f"POST /products (batch {batch})", s, e, started))
            next_product += args.products

            # A burst: the same volume written concurrently (bulk paste / sync push).
            started = time.perf_counter()
            s, e = await create_rows(
                client, "customers", next_customer, max(20, args.customers // 5), concurrency=args.concurrency
            )
            report["phases"].append(
                summarise(f"POST /customers x{args.concurrency} concurrent", s, e, started)
            )
            next_customer += max(20, args.customers // 5)

            report["reads"] = report.get("reads", [])
            report["reads"].append(
                {"after_batch": batch, "customers": next_customer, "products": next_product,
                 "probes": await measure_reads(client, f"{next_customer}c/{next_product}p")}
            )

        if not args.skip_import:
            report["imports"] = await import_files(client)

    REPORT.write_text(json.dumps(report, indent=2))
    print(f"\nreport written to {REPORT.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

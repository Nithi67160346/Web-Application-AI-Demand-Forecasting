"""Validate a sales CSV, or explicitly import it through the authenticated API.

Default: validation only. Set DEMANDLY_ACCESS_TOKEN and pass --apply to upload.
Python standard library only; uploads at most 1,000 records per request.
"""

import argparse
import csv
import json
import os
import sys
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

COLUMNS = ["sale_date", "product_code", "region", "sales_quantity", "inventory"]


def read_sales(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"Expected columns in this order: {', '.join(COLUMNS)}")
        for line, row in enumerate(reader, start=2):
            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("Incorrect number of columns")
                parsed_date = date.fromisoformat(row["sale_date"])
                if parsed_date.isoformat() != row["sale_date"]:
                    raise ValueError("Use YYYY-MM-DD dates")
                for field in ("product_code", "region"):
                    if not row[field].strip() or len(row[field]) > 64:
                        raise ValueError(f"{field} must contain 1–64 characters")
                quantity = int(row["sales_quantity"])
                inventory = int(row["inventory"]) if row["inventory"] else None
                if not 0 <= quantity <= 2_147_483_647 or (inventory is not None and not 0 <= inventory <= 2_147_483_647):
                    raise ValueError("Quantities must be nonnegative 32-bit integers")
                yield {"sale_date": parsed_date.isoformat(), "product_code": row["product_code"].strip(),
                       "region": row["region"].strip(), "sales_quantity": quantity, "inventory": inventory}
            except (TypeError, ValueError) as exc:
                raise ValueError(f"CSV line {line}: {exc}") from exc


def upload(api_url, token, items):
    request = Request(api_url.rstrip("/") + "/sales/batch",
                      data=json.dumps({"items": items}, ensure_ascii=False).encode("utf-8"),
                      headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}, method="POST")
    try:
        with urlopen(request, timeout=120) as response:
            result = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"API rejected batch (HTTP {exc.code})") from exc
    except URLError as exc:
        raise RuntimeError("Connection failed; check the last batch in the database before retrying") from exc
    if result.get("inserted") != len(items):
        raise RuntimeError("API returned an unexpected inserted count; check the last batch before retrying")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", type=Path)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--apply", action="store_true", help="Upload after validating the entire file")
    args = parser.parse_args()
    count = sum(1 for _ in read_sales(args.csv_file))
    if count == 0:
        raise ValueError("CSV must contain at least one sales record")
    print(f"Validated {count:,} records in {args.csv_file.name}", flush=True)
    if not args.apply:
        return
    token = os.environ.get("DEMANDLY_ACCESS_TOKEN")
    if not token:
        raise ValueError("Set DEMANDLY_ACCESS_TOKEN before using --apply")
    inserted, batch = 0, []
    try:
        for item in read_sales(args.csv_file):
            batch.append(item)
            if len(batch) == 1000:
                upload(args.api_url, token, batch)
                inserted += len(batch)
                print(f"Imported {inserted:,}/{count:,}", flush=True)
                batch = []
        if batch:
            upload(args.api_url, token, batch)
            inserted += len(batch)
        print(f"Imported {inserted:,} records successfully", flush=True)
    except (RuntimeError, OSError, ValueError) as exc:
        raise RuntimeError(f"Stopped after {inserted:,} confirmed inserts. {exc}") from exc


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        sys.exit(1)

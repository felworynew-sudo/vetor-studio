#!/usr/bin/env python3
"""Sum receipt/payment PDFs exported from Telegram.

The script reads text-based PDF receipts, extracts operation date and amount,
and optionally filters records by month. It is intentionally small so the same
functions can be reused from a Telegram bot handler.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - only used before dependencies exist.
    PdfReader = None


MONTHS_RU = {
    "января": 1,
    "февраля": 2,
    "марта": 3,
    "апреля": 4,
    "мая": 5,
    "июня": 6,
    "июля": 7,
    "августа": 8,
    "сентября": 9,
    "октября": 10,
    "ноября": 11,
    "декабря": 12,
}

AMOUNT = r"(?P<amount>\d{1,3}(?:[ \u00a0]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)"
RUBLE = r"(?:₽|р\.?|руб\.?|i)"

AMOUNT_PATTERNS = [
    re.compile(rf"Сумма\s+в\s+валюте\s+операции[^\n]*\n\s*{AMOUNT}\s*{RUBLE}", re.I),
    re.compile(rf"Сколько\s*\n\s*{AMOUNT}\s*{RUBLE}", re.I),
    re.compile(rf"{AMOUNT}\s*{RUBLE}\s*\n\s*Сумма\s+операции", re.I),
    re.compile(rf"Итого\s+{AMOUNT}\s*{RUBLE}", re.I),
    re.compile(rf"{AMOUNT}\s*{RUBLE}\s*Сумма", re.I),
]


@dataclass(frozen=True)
class Receipt:
    file: str
    operation_date: str | None
    amount: str
    status: str


def previous_month(today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    first_this_month = today.replace(day=1)
    last_prev_month = first_this_month.fromordinal(first_this_month.toordinal() - 1)
    first_prev_month = last_prev_month.replace(day=1)
    return first_prev_month, first_this_month


def parse_period(value: str | None) -> tuple[date | None, date | None]:
    if not value:
        return None, None
    if value == "prev":
        return previous_month()
    match = re.fullmatch(r"(\d{4})-(\d{2})", value)
    if not match:
        raise ValueError("period must be YYYY-MM or 'prev'")
    year, month = map(int, match.groups())
    start = date(year, month, 1)
    end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    return start, end


def extract_text(path: Path) -> str:
    if PdfReader is None:
        raise RuntimeError("Install dependency first: python -m pip install pypdf")
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def parse_amount(text: str) -> Decimal | None:
    for pattern in AMOUNT_PATTERNS:
        match = pattern.search(text)
        if match:
            raw = match.group("amount").replace("\u00a0", " ").replace(" ", "")
            try:
                return Decimal(raw.replace(",", "."))
            except InvalidOperation:
                return None
    return None


def parse_ru_date(day: str, month_name: str, year: str, time_value: str | None = None) -> datetime | None:
    month = MONTHS_RU.get(month_name.lower())
    if not month:
        return None
    time_value = time_value or "00:00:00"
    if len(time_value.split(":")) == 2:
        time_value += ":00"
    return datetime.strptime(f"{day}.{month}.{year} {time_value}", "%d.%m.%Y %H:%M:%S")


def parse_operation_date(text: str) -> datetime | None:
    match = re.search(
        r"Операция\s+совершена\s*\n\s*(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+в\s+(\d{1,2}:\d{2})",
        text,
        re.I,
    )
    if match:
        return parse_ru_date(*match.groups())

    match = re.search(r"(?m)^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)", text)
    if match:
        day, month, year, time_value = match.groups()
        if len(time_value.split(":")) == 2:
            time_value += ":00"
        return datetime.strptime(f"{day}.{month}.{year} {time_value}", "%d.%m.%Y %H:%M:%S")

    match = re.search(
        r"(?m)^(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)",
        text,
        re.I,
    )
    if match:
        return parse_ru_date(*match.groups())

    return None


def analyze_file(path: Path) -> Receipt:
    text = extract_text(path)
    amount = parse_amount(text)
    operation_date = parse_operation_date(text)
    if amount is None:
        return Receipt(path.name, operation_date.isoformat(sep=" ") if operation_date else None, "0", "amount_not_found")
    return Receipt(
        file=path.name,
        operation_date=operation_date.isoformat(sep=" ") if operation_date else None,
        amount=str(amount),
        status="ok",
    )


def is_in_period(receipt: Receipt, start: date | None, end: date | None) -> bool:
    if not start or not end:
        return True
    if receipt.operation_date is None:
        return False
    operation_date = datetime.fromisoformat(receipt.operation_date).date()
    return start <= operation_date < end


def analyze_folder(folder: Path, start: date | None = None, end: date | None = None) -> tuple[list[Receipt], Decimal]:
    receipts = []
    total = Decimal("0")
    for path in sorted(folder.glob("*.pdf")):
        receipt = analyze_file(path)
        if is_in_period(receipt, start, end):
            receipts.append(receipt)
            if receipt.status == "ok":
                total += Decimal(receipt.amount)
    return receipts, total


def write_csv(path: Path, receipts: list[Receipt]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["file", "operation_date", "amount", "status"])
        writer.writeheader()
        for receipt in receipts:
            writer.writerow(asdict(receipt))


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze PDF receipts and sum their amounts.")
    parser.add_argument("folder", type=Path, help="Folder with PDF receipts")
    parser.add_argument("--period", help="Month to include: YYYY-MM, or 'prev' for previous month")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    parser.add_argument("--csv", type=Path, help="Also write detailed rows to CSV")
    args = parser.parse_args()

    start, end = parse_period(args.period)
    receipts, total = analyze_folder(args.folder, start, end)

    if args.csv:
        write_csv(args.csv, receipts)

    result = {
        "folder": str(args.folder),
        "period_start": start.isoformat() if start else None,
        "period_end": end.isoformat() if end else None,
        "count": len(receipts),
        "total": str(total),
        "receipts": [asdict(receipt) for receipt in receipts],
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for receipt in receipts:
            print(f"{receipt.amount:>10}  {receipt.operation_date or '-':19}  {receipt.status:16}  {receipt.file}")
        print("-" * 72)
        print(f"Итого: {total} ₽, чеков: {len(receipts)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)

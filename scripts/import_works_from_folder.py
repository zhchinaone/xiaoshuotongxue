from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib import error, request

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_API_URL = "http://localhost:3000/api/content"
THUMB_DIR = PROJECT_ROOT / "assets" / "cases" / "thumbs"
LARGE_UPLOAD_DIR = PROJECT_ROOT / "assets" / "cases" / "large-imports"
BACKUP_DIR = PROJECT_ROOT / "backups"
REPORT_DIR = PROJECT_ROOT / "imports"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_DIRECT_UPLOAD_BYTES = 18 * 1024 * 1024
INSTITUTION_KEYWORDS = [
    "大学",
    "学院",
    "研究所",
    "研究院",
    "科学院",
    "实验室",
    "医院",
    "中心",
    "课题组",
    "公司",
    "集团",
]
INSTITUTION_RE = re.compile("|".join(re.escape(item) for item in INSTITUTION_KEYWORDS))
YEAR_RE = re.compile(r"(19|20)\d{2}")
FIGURE_RE = re.compile(r"(图\s*\d+|fig(?:ure)?\.?\s*\d+)", re.IGNORECASE)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Clear the Feishu works library and import images from a folder tree.",
    )
    parser.add_argument("source_dir", help="Folder that contains the works to import.")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Local content API URL.")
    parser.add_argument("--limit", type=int, default=0, help="Only import the first N images.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only scan and generate the import report, do not push to Feishu.",
    )
    args = parser.parse_args()

    source_dir = Path(args.source_dir).expanduser().resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        print(f"Source folder does not exist: {source_dir}", file=sys.stderr)
        return 1

    current_content = fetch_json(args.api_url)
    hero_images = current_content.get("content", {}).get("heroImages", [])

    selected_files = collect_source_images(source_dir)
    if args.limit > 0:
        selected_files = selected_files[: args.limit]

    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    LARGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = BACKUP_DIR / f"content-backup-{timestamp}.json"
    backup_path.write_text(
        json.dumps(current_content, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    cases = []
    report_items = []
    for index, image_path in enumerate(selected_files, start=1):
        relative_path = image_path.relative_to(source_dir)
        metadata = parse_metadata(image_path)
        cache_key = build_cache_key(relative_path)
        thumb_relative = Path("assets") / "cases" / "thumbs" / f"{cache_key}-thumb.jpg"
        thumb_absolute = PROJECT_ROOT / thumb_relative
        create_thumbnail(image_path, thumb_absolute)
        large_upload_path = prepare_large_upload_asset(image_path, cache_key)

        title_parts = [metadata["school"], metadata["journal"]]
        title = " · ".join(part for part in title_parts if part)
        alt = title or f"{image_path.stem} 科研绘图案例"
        case = {
            "id": None,
            "sort": index,
            "cacheKey": cache_key,
            "school": metadata["school"],
            "journal": metadata["journal"],
            "description": metadata["description"],
            "categories": "",
            "alt": alt,
            "thumbSrc": thumb_relative.as_posix(),
            "largeSrc": large_upload_path,
            "thumbAttachment": None,
            "largeAttachment": None,
            "published": True,
        }
        cases.append(case)
        report_items.append(
            {
                "sort": index,
                "sourceFile": str(image_path),
                "cacheKey": cache_key,
                "school": metadata["school"],
                "journal": metadata["journal"],
                "description": metadata["description"],
                "thumbSrc": thumb_relative.as_posix(),
                "largeSrc": large_upload_path,
            }
        )

        if index % 25 == 0 or index == len(selected_files):
            print(f"Prepared {index}/{len(selected_files)} works")

    report_path = REPORT_DIR / f"import-report-{timestamp}.json"
    report_payload = {
        "sourceDir": str(source_dir),
        "preparedCount": len(cases),
        "dedupeNote": "Same relative file stem keeps one image, preferring PNG over JPG/JPEG.",
        "items": report_items,
    }
    report_path.write_text(
        json.dumps(report_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Backed up current content to: {backup_path}")
    print(f"Wrote import report to: {report_path}")
    print(f"Prepared {len(cases)} works from {source_dir}")

    if args.dry_run:
        preview = report_items[:5]
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 0

    payload = {
        "content": {
            "heroImages": hero_images,
            "cases": cases,
        }
    }
    response = post_json(args.api_url, payload)
    result_path = REPORT_DIR / f"import-result-{timestamp}.json"
    result_path.write_text(json.dumps(response, ensure_ascii=False, indent=2), encoding="utf-8")

    imported_cases = response.get("content", {}).get("cases", [])
    print(f"Imported {len(imported_cases)} works to Feishu")
    print(f"Saved API response to: {result_path}")
    return 0


def collect_source_images(source_dir: Path) -> list[Path]:
    chosen: OrderedDict[str, Path] = OrderedDict()
    for path in sorted(source_dir.rglob("*"), key=lambda item: str(item).lower()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        key = str(path.with_suffix("")).lower()
        current = chosen.get(key)
        if current is None or extension_priority(path.suffix) > extension_priority(current.suffix):
            chosen[key] = path
    return list(chosen.values())


def extension_priority(suffix: str) -> int:
    normalized = suffix.lower()
    if normalized == ".png":
        return 3
    if normalized == ".jpg":
        return 2
    if normalized == ".jpeg":
        return 1
    return 0


def parse_metadata(image_path: Path) -> dict[str, str]:
    folder_name = image_path.parent.name
    file_stem = image_path.stem
    meta_source = folder_name if is_metadata_rich(folder_name) else file_stem
    normalized_source = normalize_delimiters(meta_source)
    signal_source = normalize_delimiters(f"{folder_name}-{file_stem}")

    year_match = YEAR_RE.search(normalized_source)
    year = year_match.group(0) if year_match else ""

    if year_match:
        before_year = normalized_source[: year_match.start()].strip(" -")
        after_year = normalized_source[year_match.end() :].strip(" -")
    else:
        before_year = normalized_source
        after_year = ""

    before_tokens = sanitize_tokens(split_tokens(before_year))
    after_tokens = sanitize_tokens(split_tokens(after_year))

    school_tokens = unique_preserve(
        token for token in before_tokens if INSTITUTION_RE.search(token)
    )
    if not school_tokens and before_tokens:
        school_tokens = [before_tokens[0]]
    school = " / ".join(school_tokens)

    journal_tokens: list[str] = []
    if after_tokens:
        journal_tokens = after_tokens
    else:
        ascii_start = next(
            (
                index
                for index, token in enumerate(before_tokens)
                if re.search(r"[A-Za-z]", token) and not looks_like_person_name(token)
            ),
            None,
        )
        if ascii_start is not None:
            journal_tokens = before_tokens[ascii_start:]
        else:
            remaining = [
                token
                for token in before_tokens
                if token not in school_tokens and not looks_like_person_name(token)
            ]
            if remaining:
                journal_tokens = [remaining[-1]]

    journal_base = clean_journal(" - ".join(journal_tokens))
    if year and journal_base:
        journal = f"{journal_base} · {year}"
    else:
        journal = journal_base or year

    description = infer_description(signal_source)
    return {
        "school": school or "合作机构",
        "journal": journal or "科研项目",
        "description": description,
    }


def is_metadata_rich(value: str) -> bool:
    return bool(YEAR_RE.search(value) or INSTITUTION_RE.search(value) or re.search(r"[A-Za-z]", value))


def normalize_delimiters(value: str) -> str:
    text = value.replace("_", "-").replace("—", "-").replace("–", "-").replace("|", "-")
    text = re.sub(r"\s*-\s*", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    return text.strip(" -")


def split_tokens(value: str) -> list[str]:
    if not value:
        return []
    return [token.strip() for token in value.split("-") if token.strip()]


def sanitize_tokens(tokens: Iterable[str]) -> list[str]:
    cleaned = []
    seen_content = False
    for token in tokens:
        normalized = clean_token(token)
        if not normalized:
            continue
        if not seen_content and re.fullmatch(r"\d+(?:\.\d+)?", normalized):
            continue
        seen_content = True
        cleaned.append(normalized)
    return cleaned


def clean_token(token: str) -> str:
    value = token.strip()
    value = re.sub(r"\s{2,}", " ", value)
    value = value.strip(" -")
    return value


def clean_journal(value: str) -> str:
    journal = value.strip(" -")
    journal = re.sub(r"(摘要图?|图形摘要|封面|图\d+|Fig(?:ure)?\.?\s*\d+)$", "", journal, flags=re.IGNORECASE)
    journal = re.sub(r"\s{2,}", " ", journal)
    return journal.strip(" -")


def looks_like_person_name(token: str) -> bool:
    value = token.strip()
    if not value or INSTITUTION_RE.search(value):
        return False
    if re.fullmatch(r"[\u4e00-\u9fff]{2,4}", value):
        return True
    if re.fullmatch(r"[\u4e00-\u9fff]{2,6}(组|老师|课题组)", value):
        return True
    if re.fullmatch(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}", value):
        return True
    return False


def infer_description(value: str) -> str:
    lowered = value.lower()
    if "封面" in value or "cover" in lowered:
        return "期刊封面"
    if "摘要" in value:
        return "图形摘要"
    if FIGURE_RE.search(lowered):
        return "论文图组"
    if "综述" in value or "review" in lowered:
        return "综述图示"
    if "机制" in value or "示意" in value:
        return "机制示意"
    return "科研绘图作品"


def unique_preserve(tokens: Iterable[str]) -> list[str]:
    seen = set()
    result = []
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        result.append(token)
    return result


def build_cache_key(relative_path: Path) -> str:
    digest = hashlib.sha1(relative_path.as_posix().lower().encode("utf-8")).hexdigest()[:12]
    return f"case-{digest}"


def create_thumbnail(source_path: Path, output_path: Path) -> None:
    create_jpeg_variant(source_path, output_path, (1280, 960), 86)


def prepare_large_upload_asset(source_path: Path, cache_key: str) -> str:
    if source_path.stat().st_size <= MAX_DIRECT_UPLOAD_BYTES:
        return str(source_path)

    output_relative = Path("assets") / "cases" / "large-imports" / f"{cache_key}-large.jpg"
    output_path = PROJECT_ROOT / output_relative
    create_jpeg_variant(source_path, output_path, (3200, 3200), 90)
    return output_relative.as_posix()


def create_jpeg_variant(
    source_path: Path,
    output_path: Path,
    max_size: tuple[int, int],
    quality: int,
) -> None:
    with Image.open(source_path) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail(max_size, Image.Resampling.LANCZOS)

        if has_transparency(image):
            flattened = Image.new("RGB", image.size, "white")
            alpha = image.getchannel("A") if "A" in image.getbands() else None
            flattened.paste(image, mask=alpha)
            target = flattened
        else:
            target = image.convert("RGB")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        target.save(output_path, format="JPEG", quality=quality, optimize=True, progressive=True)


def has_transparency(image: Image.Image) -> bool:
    return image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    )


def fetch_json(url: str) -> dict:
    with request.urlopen(url, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json(url: str, payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=3600) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Import request failed: HTTP {exc.code} {detail}") from exc


if __name__ == "__main__":
    raise SystemExit(main())

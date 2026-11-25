#!/usr/bin/env python3
"""Package web/ into a reproducible offline ZIP archive ready for dpad.games upload."""
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

MAX_FILES = 1000
MAX_ZIP_FILE = 200 * 1024 * 1024
MAX_TOTAL = 500 * 1024 * 1024


def runtime_files() -> list[str]:
    names = ["index.html"]
    for folder in ("css", "assets", "js"):
        base = WEB / folder
        if not base.exists():
            continue
        names += sorted(
            path.relative_to(WEB).as_posix()
            for path in base.rglob("*")
            if path.is_file() and not path.name.startswith(".")
        )
    return names


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist/bizarro-melee-dpad.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    files = runtime_files()
    assert "index.html" in files and (WEB / "index.html").is_file(), "web/index.html missing"
    assert len(files) <= MAX_FILES, f"Too many files: {len(files)}"

    total = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel in files:
            data = (WEB / rel).read_bytes()
            assert len(data) <= MAX_ZIP_FILE, f"File exceeds 200MB: {rel}"
            total += len(data)
            info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zf.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    assert total <= MAX_TOTAL, f"Total uncompressed size exceeds 500MB: {total}"
    print(f"{out}: {out.stat().st_size} bytes ({total} uncompressed), {len(files)} files")


if __name__ == "__main__":
    main()

"""Build the small standalone archive from the recorded lab and its pinned inputs."""

from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED


LABS = Path(__file__).resolve().parents[1] / "dist" / "labs"
PACK = "metal-empty-attention-row"
FILES = {
    PACK: ("README.md", "empty_row.py", "empty_row.swift", "validation.json"),
    "metal-online-attention": ("kernels.metal", "online_attention.swift", "validation.json"),
}

with ZipFile(LABS / f"{PACK}.zip", "w", ZIP_STORED) as archive:
    for directory, names in sorted(FILES.items()):
        for name in sorted(names):
            relative = f"{directory}/{name}"
            info = ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (LABS / relative).read_bytes())

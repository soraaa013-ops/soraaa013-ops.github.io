"""Package the portfolio and current collection for GitHub Pages in a fresh directory."""
import json
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = root / "sora/gallery"
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=False)
gallery = output / "sora/gallery"
gallery.mkdir(parents=True)
catalog = json.loads((source / "catalog.js").read_text().removeprefix("const catalog = ").strip().removesuffix(";"))
active = [work for work in catalog if work["src"].startswith("collection/")]
if not active:
    raise ValueError("The current collection is empty")

for work in active:
    for key in ("src", "thumb"):
        path = Path(work[key])
        target = gallery / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / path, target)
(gallery / "catalog.js").write_text("const catalog = " + json.dumps(active, ensure_ascii=False, indent=2) + ";\n")
for filename in ("gallery.css", "gallery.js"):
    shutil.copyfile(source / filename, gallery / filename)
shutil.copyfile(source / "index.html", gallery / "index.html")
for filename in ("index.html", "styles.css", "script.js", ".nojekyll"):
    shutil.copyfile(root / filename, output / filename)
for folder in ("assets", "sora/live"):
    shutil.copytree(root / folder, output / folder)

"""Regenerate responsive variants from published or archived originals; requires Pillow."""

import hashlib
import argparse
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "public/images"
DARK = [
    "footer-night.webp", "hero-night.webp", "level-1.webp", "level-2.webp",
    "level-3.webp", "levels-night.webp", "study-night.webp", "progress-night-facet-weave-v2.png",
    "level-2-woven-orbits-v2-dark.webp",
]
GEOMETRY = [
    "studio-01-three-trajectories.webp", "footer-orbital-sectors.webp",
    "progress-light-facet-weave-v2.png",
    "study-phase-rosettes.jpg", "level-1-triangles.jpg",
    "level-2-woven-orbits-v2.jpg",
    "studio-03-mint-intersections.webp",
    "studio-04-citron-arcades.webp", "studio-05-rose-hourglass.webp",
    "banner-level-1-braid-light.webp", "banner-level-1-braid-dark.webp",
    "banner-level-2-chevron-weave-light.webp", "banner-level-2-chevron-weave-dark.webp",
    "banner-level-3-gates-light.webp", "banner-level-3-gates-dark.webp",
    "practice-meander-light.png", "practice-meander-dark.png",
    "history-lens-light.png", "history-lens-dark.png",
    "stats-level-1-ribbon-wave-light.png", "stats-level-1-ribbon-wave-dark.png",
    "stats-level-2-ribbon-wave-light.png", "stats-level-2-ribbon-wave-dark.png",
    "stats-level-3-ribbon-wave-light.png", "stats-level-3-ribbon-wave-dark.png",
]
PROGRESS = ["level-1-foundations.png", "level-2-application.png", "level-3-expert.png"]
sources = ["brand/trainer-abstract.png", "artwork/hero-ribbon-expanded.webp"]
sources += [f"artwork/{name}.jpg" for name in ["foundations", "applied", "systems"]]
sources += [f"artwork/{name}" for name in PROGRESS + DARK + GEOMETRY]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--only",
    dest="selected_sources",
    action="append",
    default=[],
    help="regenerate these exact artwork source paths without cleaning other assets",
)
arguments = parser.parse_args()
selected_sources = set(arguments.selected_sources)
unknown_sources = selected_sources - set(sources)
if unknown_sources:
    parser.error(f"unknown source path(s): {', '.join(sorted(unknown_sources))}")
if selected_sources:
    sources = [source for source in sources if source in selected_sources]
manifest = json.loads((ROOT / "src/data/image-variants.json").read_text())
published = {}


for relative in sources:
    source = IMAGES / relative
    if not source.is_file():
        archived = ROOT / "docs/design-lab" / relative.replace("brand/", "logos/", 1)
        if archived.is_file():
            source = archived
        elif relative in manifest and not selected_sources:
            continue
        else:
            raise FileNotFoundError(source)
    with Image.open(source) as original:
        image = original.convert("RGBA" if "A" in original.getbands() else "RGB")
        width, height = image.size
        if relative.startswith("brand/"):
            sizes = [64, 128]
        elif source.name in PROGRESS or source.stem in ["level-1", "level-2", "level-3"]:
            sizes = [128, 256, 512, 768]
        else:
            sizes = [384, 768, 1152]
        variants = []
        for size in sorted(set(sizes + [width])):
            if size > width:
                continue
            target = IMAGES / Path(relative).parent / f"{source.stem}-{size}-optimized.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            output = image if size == width else image.resize((size, round(height * size / width)), Image.Resampling.LANCZOS)
            compressed_banner = source.name.startswith("banner-level-") or source.stem.startswith("level-2-woven-orbits-v2")
            options = {"quality": 92} if compressed_banner else {"lossless": True, "exact": True}
            output.save(target, "WEBP", method=6, icc_profile=original.info.get("icc_profile", b""), **options)
            if size == width and target.stat().st_size >= source.stat().st_size:
                target.unlink()
                variants.append([width, relative])
                published[hashlib.sha256(source.read_bytes()).digest()] = relative
                continue
            elif size != width and target.stat().st_size >= source.stat().st_size * 0.9:
                target.unlink()
                continue
            digest = hashlib.sha256(target.read_bytes()).digest()
            if digest in published:
                target.unlink()
                variants.append([size, published[digest]])
            else:
                file = target.relative_to(IMAGES).as_posix()
                published[digest] = file
                variants.append([size, file])
        manifest[relative] = {"width": width, "height": height, "variants": variants}
    if source != IMAGES / relative and any(file == relative for _, file in variants):
        (IMAGES / relative).write_bytes(source.read_bytes())
if not selected_sources:
    used = {file for entry in manifest.values() for _, file in entry["variants"]}
    used.add("brand/ai-studio-white.svg")
    for folder in ["brand", "artwork"]:
        for image in (IMAGES / folder).iterdir():
            relative = image.relative_to(IMAGES).as_posix()
            if not image.is_file() or relative in used:
                continue
            if image.name.endswith("-optimized.webp"):
                image.unlink()

(ROOT / "src/data/image-variants.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Responsive WebP: {len(sources)} source image(s) processed; originals preserved.")

"""Regenerate active artwork from published or archived originals; requires Pillow."""

import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "public/images"
ARCHIVE = ROOT / "docs/design-lab"
DARK = [
    "footer-night.webp", "hero-night.webp", "level-1.webp", "level-2.webp",
    "level-3.webp", "levels-night.webp", "study-night.webp", "progress-night.png",
]
GEOMETRY = [
    "studio-01-three-trajectories.webp", "footer-orbital-sectors.webp",
    "practice-folded-paths.webp", "progress-prismatic-weave.webp",
    "study-phase-rosettes.jpg", "level-1-triangles.jpg",
    "level-2-woven-orbits.jpg", "level-3-prisms.jpg",
    "studio-02-lilac-phase.webp", "studio-03-mint-intersections.webp",
    "studio-04-citron-arcades.webp", "studio-05-rose-hourglass.webp",
]
PROGRESS = ["level-1-foundations.png", "level-2-application.png", "level-3-expert.png"]
sources = ["brand/trainer-abstract.png", "artwork/hero-ribbon-expanded.webp"]
sources += [f"artwork/{name}.jpg" for name in ["foundations", "applied", "systems"]]
sources += [f"artwork/{name}" for name in PROGRESS + DARK + GEOMETRY]
manifest = {}
published = {}


def archive_image(source, archived):
    archived.parent.mkdir(parents=True, exist_ok=True)
    if archived.exists():
        if source.read_bytes() != archived.read_bytes():
            raise FileExistsError(f"Different archived source already exists: {archived}")
        source.unlink()
    else:
        source.rename(archived)


for relative in sources:
    source = IMAGES / relative
    archived = ARCHIVE / relative.replace("brand/", "logos/", 1)
    if not source.is_file():
        source = archived
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
            output.save(target, "WEBP", lossless=True, exact=True, method=6, icc_profile=original.info.get("icc_profile", b""))
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
    uses_source = any(file == relative for _, file in variants)
    if uses_source and source != IMAGES / relative:
        source.rename(IMAGES / relative)
    elif not uses_source and source == IMAGES / relative:
        archive_image(source, archived)

used = {file for entry in manifest.values() for _, file in entry["variants"]}
used.add("brand/ai-studio-white.svg")
for folder in ["brand", "artwork"]:
    for image in (IMAGES / folder).iterdir():
        relative = image.relative_to(IMAGES).as_posix()
        if not image.is_file() or relative in used:
            continue
        if image.name.endswith("-optimized.webp"):
            image.unlink()
        else:
            archive_image(image, ARCHIVE / relative.replace("brand/", "logos/", 1))

(ROOT / "src/data/image-variants.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Responsive WebP: {len(manifest)} source images; originals preserved.")

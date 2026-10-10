"""Regenerate checked-in responsive WebP assets. Maintenance only; requires Pillow."""

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "public/images"
GEOMETRY = [
    "studio-01-three-trajectories.webp", "footer-orbital-sectors.webp",
    "practice-folded-paths.webp", "progress-prismatic-weave.webp",
    "study-phase-rosettes.jpg", "level-1-triangles.jpg",
    "level-2-woven-orbits.jpg", "level-3-prisms.jpg",
    "studio-02-lilac-phase.webp", "studio-03-mint-intersections.webp",
    "studio-04-citron-arcades.webp", "studio-05-rose-hourglass.webp",
]
sources = [IMAGES / "brand/trainer-abstract.png", IMAGES / "generated/hero-ribbon-expanded.webp"]
sources += [IMAGES / f"generated/{name}.jpg" for name in ["foundations", "applied", "systems"]]
sources += sorted((IMAGES / "generated/progress").glob("*.png"))
sources += sorted((IMAGES / "generated/dark").glob("*.webp"))
sources += [IMAGES / f"generated/backgrounds/geometry/{name}" for name in GEOMETRY]
manifest = {}
for source in sources:
    relative = source.relative_to(IMAGES).as_posix()
    with Image.open(source) as original:
        image = original.convert("RGBA" if "A" in original.getbands() else "RGB")
        width, height = image.size
        if relative.startswith("brand/"):
            sizes = [64, 128]
        elif "/progress/" in relative or "/dark/level-" in relative:
            sizes = [128, 256, 512, 768]
        else:
            sizes = [384, 768, 1152]
        variants = []
        for size in sizes + [width]:
            if size > width:
                continue
            target = IMAGES / "optimized" / Path(relative).parent / f"{source.stem}-{size}.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            if size == width and source.suffix == ".webp":
                target.unlink(missing_ok=True)
                variants.append([width, relative])
                continue
            output = image if size == width else image.resize((size, round(height * size / width)), Image.Resampling.LANCZOS)
            output.save(target, "WEBP", lossless=True, exact=True, method=6, icc_profile=original.info.get("icc_profile", b""))
            if target.stat().st_size >= source.stat().st_size * 0.9:
                target.unlink()
                if size == width:
                    variants.append([width, relative])
            else:
                variants.append([size, target.relative_to(IMAGES).as_posix()])
        manifest[relative] = {"width": width, "height": height, "variants": variants}
(ROOT / "src/data/image-variants.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Responsive WebP: {len(manifest)} source images; originals preserved.")

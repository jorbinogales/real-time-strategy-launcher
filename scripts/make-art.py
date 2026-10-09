"""Genera el arte del instalador (build/*.bmp, icon.ico) y del launcher
(launcher/renderer/art/*) a partir del arte del sitio. Solo lectura sobre el sitio.
Uso: python scripts/make-art.py [ruta-al-sitio]  (por defecto C:/dev/rts-landing/public)"""
import json, shutil, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/dev/rts-landing/public")
BUILD = ROOT / "build"
ART = ROOT / "launcher" / "renderer" / "art"
BUILD.mkdir(exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)

hero = Image.open(SITE / "images/hero/hero-humanos-vs-orcos.jpg").convert("RGB")
icon = Image.open(SITE / "brand/masterwar-icon.png").convert("RGBA")

# --- icono .ico
icon.save(BUILD / "icon.ico", sizes=[(s, s) for s in (256, 128, 64, 48, 32, 16)])

def cover(im, w, h, cx=0.5):
    r = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = round((im.width - w) * cx)
    return im.crop((x, 0, x + w, h)) if im.height == h else im.crop((x, (im.height - h) // 2, x + w, (im.height - h) // 2 + h))

def darken_bottom(im, start=0.45, strength=0.88):
    w, h = im.size
    ov = Image.new("L", (1, h))
    for y in range(h):
        t = max(0.0, (y / h - start) / (1 - start))
        ov.putpixel((0, y), int(255 * strength * t))
    ov = ov.resize((w, h))
    return Image.composite(Image.new("RGB", (w, h), (10, 8, 6)), im, ov)

# --- sidebar del instalador 164x314 (BMP 24 bits): recorte vertical del hero + icono
def sidebar():
    im = cover(hero, 164, 314, cx=0.30)
    im = darken_bottom(im)
    ic = icon.resize((104, 104), Image.LANCZOS)
    im.paste(ic, ((164 - 104) // 2, 28), ic)
    return im
sidebar().save(BUILD / "installerSidebar.bmp")
sidebar().save(BUILD / "uninstallerSidebar.bmp")

# --- cabecera 150x57
hd = cover(hero, 150, 57, cx=0.5)
hd = Image.blend(hd, Image.new("RGB", hd.size, (10, 8, 6)), 0.35)
ic = icon.resize((44, 44), Image.LANCZOS)
hd.paste(ic, (150 - 50, 6), ic)
hd.save(BUILD / "installerHeader.bmp")

# --- arte del launcher
hero.resize((1920, 1080), Image.LANCZOS).save(ART / "hero.jpg", quality=84, optimize=True)
shutil.copyfile(SITE / "brand/masterwar-logo.svg", ART / "logo.svg")
icon.resize((256, 256), Image.LANCZOS).save(ART / "icon.png", optimize=True)

NAMES = {"humanos": "Humanos", "orcos": "Orcos", "elfos": "Elfos", "enanos": "Enanos"}
units = []
for race in NAMES:
    out = ART / "units" / race
    out.mkdir(parents=True, exist_ok=True)
    for src in sorted((SITE / "images/units" / race).glob("*.png")):
        im = Image.open(src).convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        if bbox: im = im.crop(bbox)
        im.thumbnail((640, 760), Image.LANCZOS)
        im.save(out / src.name, optimize=True)
        units.append({"race": NAMES[race], "raceId": race, "name": src.stem.replace("-", " ").title(),
                      "src": f"art/units/{race}/{src.name}"})
    sh = Image.open(SITE / "images/shields" / f"{race}.png").convert("RGBA")
    sh.thumbnail((256, 256), Image.LANCZOS)
    (ART / "shields").mkdir(exist_ok=True)
    sh.save(ART / "shields" / f"{race}.png", optimize=True)
(ART / "units.json").write_text(json.dumps(units, ensure_ascii=False, indent=1), encoding="utf-8")
print("units:", len(units))

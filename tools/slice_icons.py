"""Slice Codex sprite sheets (magenta bg) into transparent 256px icons. Usage: python slice_icons.py"""
import numpy as np, json, os, sys
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "ui", "icons")
TIGHT = {"keywide", "keycluster", "pad_start", "keysmall", "mouse", "key"}
SHEETS = {
  "s1": ["people","happy","sad","coin","sun","lantern"],
  "s2": ["moon","check","cross","speaker","gear","crown"],
  "s3": ["house","vault","jar","crystal","hammer","chart"],
  "s4": ["chest","card","shield","tree","book","cottage"],
  "s5": ["owl","star","bulb","basket","scroll","heart"],
  "s6": ["calendar","purse","warning","bed","egg","note"],
  "s7": ["bread","milk","carrots","cabbage","apples","eggs"],
  "s8": ["cheese","medicine","candles","fish","cookie","tea"],
  "s9": ["cake","sundae","donuts","candy","juice","repeat"],
  "s10": ["plus","minus","box","boxchecked","sparkle","tap"],
  "s11": ["key","keywide","keycluster","mouse","touch","keysmall"],
  "s12": ["pad_a","pad_b","pad_x","pad_y","pad_start","pad_stick"],
}

def key_alpha(rgb):
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g           # magenta-ness
    alpha = 1 - np.clip((m - 60) / 140, 0, 1)
    # decontaminate fringe
    al = np.clip(alpha, 0.02, 1)[..., None]
    M = np.array([255, 0, 255], np.float32)
    out = (a - (1 - al) * M) / al
    return np.clip(out, 0, 255).astype(np.uint8), alpha

def process(path):
    im = Image.open(path).convert("RGB")
    rgb, alpha = key_alpha(np.array(im))
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    return rgba, alpha

def trim_square(rgba, size, pad=0.08):
    ys, xs = np.where(rgba[..., 3] > 8)
    c = rgba[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = c.shape[:2]; s = int(max(h, w) / (1 - 2 * pad))
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(c), ((s - w) // 2, (s - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    done = []
    for sh, names in SHEETS.items():
        p = os.path.join(HERE, "_gen", sh, "sheet.png")
        if not os.path.exists(p): print("missing", sh); continue
        rgba, alpha = process(p)
        mask = ndimage.binary_dilation(alpha > 0.5, iterations=22)
        lab, n = ndimage.label(mask)
        objs = ndimage.find_objects(lab)
        boxes = [(o, (o[0].start + o[0].stop) / 2, (o[1].start + o[1].stop) / 2, i + 1) for i, o in enumerate(objs)]
        boxes = [b for b in boxes if (b[0][0].stop - b[0][0].start) > 60]
        print(sh, "components:", len(boxes))
        # sort rows (by y centre bucket) then x
        h = rgba.shape[0]; rows = sorted(boxes, key=lambda b: b[1])
        half = len(rows) // 2 if len(rows) > 3 else len(rows)
        r1 = sorted(rows[:half], key=lambda b: b[2]); r2 = sorted(rows[half:], key=lambda b: b[2])
        for (o, _, _, lid), name in zip(r1 + r2, names):
            sub = rgba[o].copy()
            sub[..., 3] = np.where(lab[o] == lid, sub[..., 3], 0) if False else sub[..., 3]
            if name in TIGHT:
                ys, xs = np.where(sub[..., 3] > 8); c = Image.fromarray(sub[ys.min():ys.max()+1, xs.min():xs.max()+1])
                for k, hh in ((1, 64), (2, 128), (3, 192)):
                    c.resize((round(c.width * hh / c.height), hh), Image.LANCZOS).save(os.path.join(OUT, f"{name}@{k}x.png"))
                c.resize((round(c.width * 128 / c.height), 128), Image.LANCZOS).save(os.path.join(OUT, name + ".png")); done.append(name); continue
            img = trim_square(sub, 288)
            img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, name + ".png"))
            for k, px in ((1, 96), (2, 192), (3, 288)):
                img.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, f"{name}@{k}x.png"))
            done.append(name)
    done = sorted(done)
    json.dump(sorted(done), open(os.path.join(OUT, "index.json"), "w"))
    print(len(done), "icons")

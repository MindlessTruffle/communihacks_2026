"""Key magenta out of Codex frame pieces, trim, downscale -> public/ui/frames/<name>.png"""
import os, numpy as np
from PIL import Image
from slice_icons import process
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "ui", "frames")
os.makedirs(OUT, exist_ok=True)
MAXW = {"yes": 256, "no": 256, "tile": 256, "ribbon": 640}
for d in sorted(os.listdir(os.path.join(HERE, "_gen"))):
    if d == "f-panel": continue
    if not (d.startswith(("f-","g-","g2-"))): continue
    
    p = os.path.join(HERE, "_gen", d, "frame.png")
    if not os.path.exists(p): print("missing", d); continue
    rgba, _ = process(p)
    from scipy import ndimage
    lab, n = ndimage.label(rgba[..., 3] > 128)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = lab == (int(np.argmax(sizes)) + 1)
    keep = ndimage.binary_dilation(keep, iterations=6)
    rgba[..., 3] = np.where(keep, rgba[..., 3], 0)
    ys, xs = np.where(rgba[..., 3] > 8)
    im = Image.fromarray(rgba[ys.min():ys.max()+1, xs.min():xs.max()+1])
    name = "panel" if d == "f-panel2" else d.split("-",1)[1]; mw = MAXW.get(name, 480)
    full = im
    for k in (1, 2, 3):
        w = mw * k; o = full.resize((w, round(full.height * w / full.width)), Image.LANCZOS)
        o.save(os.path.join(OUT, f"{name}@{k}x.png"))
        if k == 1: o.save(os.path.join(OUT, name + ".png")); print(name, o.size, "src", full.size)

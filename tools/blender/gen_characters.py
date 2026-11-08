"""
Royal Concerns - parametric mid-poly "puppet" characters.

Run (background Blender only, never the user's open file):
  "E:\\Steam\\steamapps\\common\\Blender\\blender.exe" -b --factory-startup -P tools/blender/gen_characters.py -- OUT_DIR [only_ids,comma] [--preview PNG]

  OUT_DIR       usually E:/RoyalConcerns/game/public/models/chars
  only_ids      optional comma list (e.g. ruler-a,tilly) - default: everything
  --preview P   don't export; build the (selected) cast side by side and render a lineup PNG

Output: <id>.glb per character, wheelchair.glb, wheelchair-power.glb, cane.glb, palette.png

PART CONTRACT (node names in the GLB, character faces +Z in three.js, Y up):
  torso            pivot at the hip/waist (y ~0.25). Top-level node. userData: crownY, float, noLegs
    head           pivot at neck (y ~0.50). children: hair, hat, glasses, eye_l, eye_r, mouth (all optional but eyes)
    arm_l, arm_r   pivot at shoulder. child: hand_l / hand_r (pivot at wrist)
    cape           optional, pivot at shoulders
  leg_l, leg_r     pivot at hip. Top-level nodes (absent for ghosts).
  character's right = three -X.  Natural height ~0.9 (code scales by 0.42 to match old Kenney size).
All characters share ONE material (palette atlas, UVs point at swatch centres).
"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Euler

# ----------------------------------------------------------------- args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = globals().get("OUT") or (argv[0] if argv else os.path.join(os.getcwd(), "public", "models", "chars"))
ONLY = None
PREVIEW = None
PORTRAITS = None
MODE = {}
rest = argv[1:]
i = 0
while i < len(rest):
    if rest[i] == "--preview":
        PREVIEW = rest[i + 1]; i += 2
    elif rest[i] in ("--owl", "--food", "--owlpreview", "--foodpreview", "--crown"):
        MODE[rest[i]] = rest[i + 1]; i += 2
    elif rest[i] == "--portraits":
        PORTRAITS = rest[i + 1]; i += 2
    else:
        ONLY = rest[i].split(","); i += 1
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------- palette atlas
def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]

PAL = [
    # skins
    ("skin_pale", "#f7d6bd"), ("skin_light", "#f0c09a"), ("skin_tan", "#dba070"), ("skin_olive", "#c9a06a"),
    ("skin_brown", "#a8683f"), ("skin_dark", "#70432a"), ("skin_green", "#9bd96e"), ("skin_ghost", "#d4ecff"),
    # hair
    ("h_black", "#2b1f22"), ("h_brown", "#5c3624"), ("h_chestnut", "#a4523a"), ("h_blond", "#ecc45c"),
    ("h_red", "#bb4a2a"), ("h_grey", "#b8b3b2"), ("h_white", "#f2efe9"), ("h_navy", "#27325c"), ("h_teal", "#2aa6a0"),
    # clothes
    ("red", "#c8323a"), ("dark_red", "#8f1f2a"), ("rust", "#b4502f"), ("orange", "#ee8a2c"), ("yellow", "#f4c830"),
    ("gold", "#f2b627"), ("green", "#43a04c"), ("dark_green", "#2b6a3d"), ("lime", "#8ac43b"), ("teal", "#1f9ca2"),
    ("blue", "#3b7ad8"), ("navy", "#27407a"), ("purple", "#7e52cc"), ("dark_purple", "#4c2d7c"), ("pink", "#ef82aa"),
    ("white", "#f7f3ea"), ("cream", "#efe2c3"), ("tan", "#cba66b"), ("brown", "#7c5434"), ("dark_brown", "#4b301f"),
    ("grey", "#8b939d"), ("steel", "#b3bdc9"), ("dark_steel", "#5d6a7a"), ("black", "#28252c"), ("cyan", "#4fe3ea"),
    ("blush", "#f2918f"), ("eye", "#1f1a22"), ("eye_hi", "#ffffff"), ("mouth", "#8c3a3c"), ("straw", "#e8c966"),
    ("fur", "#f5f0e8"), ("sky", "#8fd0f5"), ("magenta", "#d94fa0"), ("mint", "#8fe0b5"), ("peach", "#ffb98a"),
    ("crust", "#c98a4b"), ("dough", "#f3d9a0"), ("choc", "#5a3220"), ("cheese", "#f7cf4a"), ("leaf", "#59b34a"),
    ("fpink", "#ff9ec4"), ("fblue", "#8fd0ff"), ("vanilla", "#fff1c9"), ("glass", "#bfe8f5"), ("bpurple", "#5a2a8a"),
    ("foil", "#ffd23f"), ("wrap", "#e8307a"),
]
PAL += [
    ("shade", "#c97c64"), ("dark_gold", "#b8820f"), ("gem_red", "#e8203c"), ("gem_blue", "#2b8dff"), ("gem_green", "#25c46c"),
    ("pearl", "#fff8ea"), ("bark", "#6b4a2b"), ("gem_pink", "#ff5fa8"),
]
def _mixhex(h, t, k):
    a = hex_rgb(h); b = hex_rgb(t)
    return "#%02x%02x%02x" % tuple(int(255 * (x * (1 - k) + y * k)) for x, y in zip(a, b))
_base = list(PAL)
for _n, _h in _base:
    if _n.startswith("h_"):
        PAL.append(("hl_" + _n[2:], _mixhex(_h, "#ffffff", 0.2)))
        PAL.append(("hd_" + _n[2:], _mixhex(_h, "#000000", 0.28)))
    else:
        PAL.append(("d_" + _n, _mixhex(_h, "#2a1020", 0.24)))
        PAL.append(("l_" + _n, _mixhex(_h, "#fff4d8", 0.22)))
COLS, ROWS, SW = 16, (len(PAL) + 15) // 16, 8
CI = {n: i for i, (n, _) in enumerate(PAL)}
def dk(c): return "d_" + c if "d_" + c in CI else c
def lt(c): return "l_" + c if "l_" + c in CI else c

TILE = 64
def atlas_h():
    return ROWS * SW + TILE

def _hexof(name):
    return dict(PAL)[name]

def paint_feather_tile(px, W, H):
    """Painted chevron (V/U feather) marks, low contrast, same brown family. Pixel rows are bottom-up; tile occupies rows 0..TILE-1, cols 0..TILE-1."""
    base = hex_rgb(_hexof("l_brown")); dark = hex_rgb(_hexof("brown")); hi = hex_rgb(_hexof("l_tan"))
    P_, R_ = 32.0, 21.0
    for y in range(TILE):
        for x in range(TILE):
            row = int(y // R_)
            xo = x + (P_ / 2 if row % 2 else 0)
            u = ((xo % P_) / P_ - 0.5) * P_
            yy = (y % R_)
            yc = 5.5 + 0.62 * abs(u)  # V rising to the sides = U-ish feather edge
            d = abs(yy - yc)
            line = max(0.0, 1.0 - d / 2.4) ** 1.5
            below = max(0.0, 1.0 - max(0.0, yy - yc) / 7.0) * (1 if yy > yc else 0)  # soft shade under the mark
            t = min(1.0, line * 0.8 + below * 0.18)
            glow = max(0.0, 1.0 - abs(yy - (yc + 3.2)) / 1.6) * 0.25
            col = [base[i] * (1 - t) + dark[i] * t for i in range(3)]
            col = [col[i] * (1 - glow) + hi[i] * glow for i in range(3)]
            o = (y * W + x) * 4
            px[o:o + 4] = [col[0], col[1], col[2], 1.0]

def tile_uv(a, b):
    """a,b in 0..1 across the painted tile -> atlas uv (kept 1.5px inside the tile)."""
    W, H = COLS * SW, atlas_h()
    a = min(max(a, 0.0), 1.0); b = min(max(b, 0.0), 1.0)
    return ((1.5 + a * (TILE - 3)) / W, (1.5 + b * (TILE - 3)) / H)

def build_palette_image():
    W, H = COLS * SW, atlas_h()
    px = [0.0] * (W * H * 4)
    for idx, (_, hx) in enumerate(PAL):
        cx, cy = idx % COLS, idx // COLS
        r, g, b = hex_rgb(hx)
        for y in range(SW):
            for x in range(SW):
                X = cx * SW + x
                Y = H - 1 - (cy * SW + y)  # image rows are bottom-up; swatch row 0 on top
                o = (Y * W + X) * 4
                px[o:o + 4] = [r, g, b, 1.0]
    paint_feather_tile(px, W, H)
    img = bpy.data.images.new("palette", W, H, alpha=False)
    img.pixels = px
    path = os.path.join(OUT, "palette.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img2 = bpy.data.images.load(path, check_existing=False)
    img2.name = "palette"
    return img2

def swatch_uv(name):
    i = CI[name]
    cx, cy = i % COLS, i // COLS
    return ((cx + 0.5) / COLS, 1 - ((cy + 0.5) * SW) / atlas_h())

PAL_MAT = None
GLOSS_MAT = None
def palette_material(gloss=False):
    global PAL_MAT, GLOSS_MAT
    if gloss and GLOSS_MAT and GLOSS_MAT.name in bpy.data.materials:
        return GLOSS_MAT
    if gloss:
        base = palette_material()
        m = bpy.data.materials.new("PaletteGloss")
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base.node_tree.nodes["Image Texture"].image
        tex.interpolation = "Closest"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.35
        bsdf.inputs["Roughness"].default_value = 0.12
        bsdf.inputs["Metallic"].default_value = 0.15
        GLOSS_MAT = m
        return m
    if PAL_MAT and PAL_MAT.name in bpy.data.materials:
        return PAL_MAT
    img = build_palette_image()
    m = bpy.data.materials.new("Palette")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    PAL_MAT = m
    return m

# ----------------------------------------------------------------- geometry kit
def _cs(a, e):
    c = math.cos(a)
    return math.copysign(abs(c) ** e, c)

def _ss(a, e):
    s = math.sin(a)
    return math.copysign(abs(s) ** e, s)

class Part:
    """One exported node. Geometry is authored in character space (Blender: Z up, faces -Y), pivot given in same space."""
    def __init__(self, name, pivot, parent=None, props=None):
        self.name, self.pivot, self.parent = name, Vector(pivot), parent
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.props = props or {}
        self.obj = None

    def _face(self, vs, col):
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return
        f.smooth = True
        fn = getattr(self, "_uvfn", None)
        if fn:
            for l in f.loops:
                l[self.uv].uv = fn(l.vert.co)
            return
        u, v = swatch_uv(col)
        for l in f.loops:
            l[self.uv].uv = (u, v)

def sq(P, c, r, col, e=(1.0, 1.0), rot=(0, 0, 0), nu=14, nv=8, taper=0.0, clip=None, mirror_x=False, uvfn=None):
    """Superquadric (ellipsoid / rounded box / capsule). Pole axis = local Z. taper: shrink toward +Z. uvfn: optional per-vertex uv (painted tile)."""
    P._uvfn = uvfn
    if mirror_x:
        sq(P, c, r, col, e, rot, nu, nv, taper, clip, False)
        c2 = (-c[0], c[1], c[2])
        rr = (-rot[0], -rot[1] * 1, -rot[2]) if False else (rot[0], -rot[1], -rot[2])
        cl2 = (lambda p: clip(Vector((-p.x, p.y, p.z)))) if clip else None
        sq(P, c2, r, col, e, rr, nu, nv, taper, cl2, False)
        return
    c = Vector(c)
    R = Euler(rot, "XYZ").to_matrix()
    e1, e2 = e
    cache = {}
    def vert(j, k):
        if k == 0: key = ("b",)
        elif k == nv: key = ("t",)
        else: key = (j % nu, k)
        if key in cache: return cache[key]
        if k == 0: p = Vector((0, 0, -r[2]))
        elif k == nv: p = Vector((0, 0, r[2]))
        else:
            v = -math.pi / 2 + math.pi * k / nv
            u = 2 * math.pi * (j % nu) / nu
            zn = _ss(v, e1)
            f = 1.0 - taper * (zn + 1) / 2
            p = Vector((r[0] * _cs(v, e1) * _cs(u, e2) * f, r[1] * _cs(v, e1) * _ss(u, e2) * f, r[2] * zn))
        p = c + R @ p
        cache[key] = p
        return p
    def cen(pts):
        s = Vector()
        for q in pts: s += q
        return s / len(pts)
    bmv = {}
    def getv(j, k):
        p = vert(j, k)
        key = (round(p.x, 5), round(p.y, 5), round(p.z, 5), id(cache))
        if key not in bmv: bmv[key] = P.bm.verts.new(p)
        return bmv[key]
    for k in range(nv):
        for j in range(nu):
            pts = [vert(j, k), vert(j + 1, k), vert(j + 1, k + 1), vert(j, k + 1)]
            if k == 0: quad = [(j, 0), (j + 1, 1), (j, 1)]
            elif k == nv - 1: quad = [(j, k), (j + 1, k), (j, nv)]
            else: quad = [(j, k), (j + 1, k), (j + 1, k + 1), (j, k + 1)]
            if k == 0: pts = [vert(j, 0), vert(j + 1, 1), vert(j, 1)]
            elif k == nv - 1: pts = [vert(j, k), vert(j + 1, k), vert(j, nv)]
            if clip and clip(cen(pts)): continue
            # bottom fan winding: pole -> (j+1,1) -> (j,1) is outward when seen from below (clockwise from +z)
            P._face([getv(*q) for q in quad], col)

def torus(P, c, R, r, col, rot=(0, 0, 0), nu=22, nv=8):
    P._uvfn = None
    c = Vector(c)
    M = Euler(rot, "XYZ").to_matrix()
    grid = []
    for j in range(nu):
        row = []
        for k in range(nv):
            u = 2 * math.pi * j / nu
            v = 2 * math.pi * k / nv
            p = Vector(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v)))
            row.append(P.bm.verts.new(c + M @ p))
        grid.append(row)
    for j in range(nu):
        for k in range(nv):
            P._face([grid[j][k], grid[(j + 1) % nu][k], grid[(j + 1) % nu][(k + 1) % nv], grid[j][(k + 1) % nv]], col)

def sph(P, c, r, col, **kw):
    sq(P, c, (r, r, r), col, **kw)

def sq_dir(P, c, r, col, d, **kw):
    """Superquadric whose long (Z) axis points along direction d."""
    d = Vector(d).normalized()
    eul = Vector((0, 0, 1)).rotation_difference(d).to_euler("XYZ")
    sq(P, c, r, col, rot=(eul.x, eul.y, eul.z), **kw)

def finish_part(P, S=1.0, gloss=False):
    """Turn the bmesh into an object, localise to pivot, apply size S, link parent."""
    bm = P.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for v in bm.verts:
        v.co = (v.co - P.pivot) * S
    me = bpy.data.meshes.new(P.name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(palette_material(gloss))
    obj = bpy.data.objects.new(P.name, me)
    bpy.context.scene.collection.objects.link(obj)
    if P.parent is not None:
        obj.parent = P.parent.obj
        obj.location = (P.pivot - P.parent.pivot) * S
    else:
        obj.location = P.pivot * S
    for k, v in P.props.items():
        obj[k] = v
    P.obj = obj
    return obj

# ----------------------------------------------------------------- body kit
HEAD_C = Vector((0, 0, 0.67))
NECK = Vector((0, 0, 0.50))
HIP_Z = 0.25
SH_Z = 0.47

def is_front_low(p, ymax=-0.03, zmax=0.80):
    return (p.y - HEAD_C.y) < ymax and p.z < zmax

def _hair_base(P, style, col, spec):
    """All coordinates are absolute character space; head centre = HEAD_C."""
    cx, cy, cz = 0, 0.02, 0.695
    def cap(rad=(0.228, 0.218, 0.215), c=(cx, cy, cz), zlim=0.79, ylim=-0.04, ears=False):
        cc = Vector(c)
        ax = Vector((0, -0.94, -0.33))
        def clip(p):
            d = (p - cc).normalized()
            az = math.atan2(d.x, -d.y)
            if d.dot(ax) > 0.58 + 0.055 * math.sin(6.0 * az + 0.7) + 0.04 * math.sin(11.0 * d.z):
                return True  # round hairline opening following the skull (curved, never a straight edge)
            return ears and p.z < 0.675 and abs(p.x) > 0.14
        sq(P, c, rad, col, nu=22, nv=12, clip=clip)
        for sx in (-1, 1):  # sideburn locks hide the hairline edge from the side
            for k in range(3):
                sq_dir(P, (sx * (0.205 - k * 0.004), -0.07 + k * 0.045, 0.655 - k * 0.012), (0.034, 0.028, 0.075), col, (sx * 0.05, 0, -1), nu=8, nv=6, taper=0.5)
    def fringe(n=5, z=0.80, y=-0.158, spread=0.15, size=0.062):
        for i in range(n):
            t = i / (n - 1) - 0.5
            x = t * spread * 2
            zz = z - abs(t) * 0.07
            sq(P, (x, y + abs(t) * 0.05, zz), (size, size * 0.8, size * 0.85), col, nu=10, nv=6)
    if style == "bald":
        sq(P, (0, 0.05, 0.60), (0.218, 0.19, 0.12), col, nu=16, nv=8, clip=lambda p: (p.z > 0.66 or p.y < -0.02))
        return
    if style == "bob":
        cap(); fringe();
        sq(P, (0, 0.07, 0.60), (0.235, 0.17, 0.17), col, nu=16, nv=8)
        sq(P, (0.205, 0.0, 0.58), (0.05, 0.075, 0.12), col, nu=8, nv=6, mirror_x=True)
    elif style == "long":
        cap(); fringe(6)
        sq(P, (0, 0.085, 0.6), (0.235, 0.15, 0.16), col, nu=16, nv=8)
        sq(P, (0, 0.105, 0.57), (0.17, 0.07, 0.11), col, nu=14, nv=8, taper=-0.15)
        sq(P, (0.205, -0.01, 0.55), (0.05, 0.075, 0.2), col, nu=8, nv=6, mirror_x=True)
    elif style == "ponytail":
        cap(); fringe(5)
        sq(P, (0, 0.2, 0.72), (0.06, 0.06, 0.06), "red" if col != "red" else "gold", nu=8, nv=6)
        sq(P, (0, 0.27, 0.58), (0.075, 0.07, 0.19), col, nu=12, nv=8, rot=(-0.45, 0, 0), taper=0.4)
        sq(P, (0.205, 0.0, 0.58), (0.05, 0.075, 0.1), col, nu=8, nv=6, mirror_x=True)
    elif style == "pigtails":
        cap(); fringe(5)
        for sx in (-1, 1):
            sph(P, (sx * 0.235, 0.03, 0.70), 0.055, "pink", nu=8, nv=6)
            sq(P, (sx * 0.27, 0.03, 0.58), (0.075, 0.075, 0.15), col, nu=12, nv=8, rot=(0, sx * 0.18, 0), taper=0.45)
    elif style == "braids":
        cap(); fringe(5)
        for sx in (-1, 1):
            for k in range(3):
                sph(P, (sx * (0.215 + k * 0.012), 0.04, 0.60 - k * 0.075), 0.06 - k * 0.006, col, nu=10, nv=6)
            sph(P, (sx * 0.24, 0.04, 0.36), 0.04, "red", nu=8, nv=6)
    elif style == "bun":
        cap(); fringe(5)
        sph(P, (0, 0.05, 0.93), 0.1, col, nu=14, nv=9)
        torus(P, (0, 0.05, 0.875), 0.075, 0.016, "gold" if col != "gold" else "red", nu=14, nv=6)
        sq(P, (0, 0.085, 0.60), (0.225, 0.15, 0.15), col, nu=14, nv=8)
    elif style == "bun_low":
        cap(); fringe(5)
        sph(P, (0, 0.2, 0.62), 0.1, col, nu=14, nv=9)
        sq(P, (0, 0.085, 0.60), (0.225, 0.15, 0.15), col, nu=14, nv=8)
        sq(P, (0.205, 0.0, 0.60), (0.045, 0.07, 0.1), col, nu=8, nv=6, mirror_x=True)
    elif style == "afro":
        sq(P, (0, 0.03, 0.72), (0.27, 0.26, 0.24), col, nu=22, nv=12, clip=lambda p: (p - Vector((0, 0.03, 0.72))).normalized().dot(Vector((0, -0.94, -0.33))) > 0.6)
        rng = random.Random(3)
        for k in range(14):
            a = rng.uniform(0, 2 * math.pi); b = rng.uniform(0.15, 1.2)
            x = math.cos(a) * math.cos(b) * 0.25; y = 0.04 + math.sin(a) * math.cos(b) * 0.24; z = 0.72 + math.sin(b) * 0.22
            if y < -0.05 and z < 0.82: continue
            sph(P, (x, y, z), 0.085, col, nu=10, nv=6)
        fringe(5, z=0.815, size=0.068)
    elif style == "curly":
        cap(rad=(0.24, 0.23, 0.225)); fringe(6, size=0.07)
        rng = random.Random(5)
        for k in range(11):
            a = rng.uniform(0.4, 2 * math.pi - 0.4); b = rng.uniform(-0.1, 1.1)
            x = math.cos(a) * math.cos(b) * 0.23; y = 0.05 + math.sin(a) * math.cos(b) * 0.22; z = 0.70 + math.sin(b) * 0.2
            if y < -0.05 and z < 0.80: continue
            sph(P, (x, y, z), 0.07, col, nu=8, nv=6)
    elif style == "short":
        cap(rad=(0.222, 0.212, 0.205), c=(cx, 0.015, 0.70)); fringe(4, z=0.81, size=0.058)
        sq(P, (0.2, 0.03, 0.66), (0.035, 0.07, 0.07), col, nu=8, nv=6, mirror_x=True)
        sq(P, (0.03, -0.14, 0.835), (0.09, 0.05, 0.04), col, nu=8, nv=6, rot=(0, 0, 0.3))
    elif style == "spiky":
        cap(rad=(0.222, 0.212, 0.205), c=(cx, 0.015, 0.70)); fringe(4, z=0.81, size=0.058)
        for k, (x, y, rz) in enumerate([(0, -0.05, 0), (0.1, -0.02, -0.35), (-0.1, -0.02, 0.35), (0.14, 0.07, -0.55), (-0.14, 0.07, 0.55), (0, 0.12, 0)]):
            sq(P, (x, y, 0.93), (0.065, 0.065, 0.1), col, nu=8, nv=5, rot=(0, rz * 0.6 if k else 0, rz * 0.0), taper=0.9)
    elif style == "mop":
        cap(rad=(0.232, 0.222, 0.22)); fringe(7, z=0.775, y=-0.16, size=0.068)
        sq(P, (0, 0.07, 0.6), (0.232, 0.16, 0.16), col, nu=14, nv=8)
        sq(P, (0.21, 0.0, 0.62), (0.05, 0.08, 0.1), col, nu=8, nv=6, mirror_x=True)
    elif style == "messy":
        cap(rad=(0.232, 0.222, 0.215)); fringe(5, size=0.064)
        sq(P, (0, 0.085, 0.6), (0.225, 0.15, 0.15), col, nu=14, nv=8)
        for (x, y, z, rx, ry) in [(0.2, 0.02, 0.84, 0.0, -0.9), (-0.2, 0.02, 0.84, 0.0, 0.9), (0.0, 0.12, 0.9, 0.7, 0.0), (0.12, -0.05, 0.93, 0.0, -0.3), (-0.12, -0.05, 0.93, 0.0, 0.3)][2:]:
            sq(P, (x, y, z - 0.02), (0.045, 0.045, 0.07), col, nu=8, nv=5, rot=(rx, ry, 0), taper=0.8)
    elif style == "slick":
        cap(rad=(0.222, 0.212, 0.205), c=(cx, 0.02, 0.70), zlim=0.82)
        sq(P, (0, 0.07, 0.62), (0.215, 0.14, 0.14), col, nu=14, nv=8)
        sq(P, (0.03, -0.12, 0.855), (0.12, 0.07, 0.04), col, nu=8, nv=6, rot=(0, 0, -0.35))
    elif style == "shag":
        cap(rad=(0.232, 0.222, 0.215)); fringe(6, size=0.066)
        sq(P, (0, 0.08, 0.58), (0.24, 0.16, 0.19), col, nu=14, nv=8)
        for sx in (-1, 1):
            sq(P, (sx * 0.2, 0.0, 0.55), (0.06, 0.08, 0.13), col, nu=8, nv=6, rot=(0, sx * 0.2, 0), taper=0.3)
    elif style == "wild":
        cap(rad=(0.245, 0.235, 0.225)); fringe(6, size=0.072)
        rng = random.Random(8)
        for k in range(9):
            a = rng.uniform(0, 2 * math.pi)
            x = math.cos(a) * 0.23; y = 0.04 + math.sin(a) * 0.22
            if y < -0.05: continue
            sq(P, (x, y, rng.uniform(0.74, 0.9)), (0.055, 0.055, 0.12), col, nu=8, nv=5, rot=(0.5 * math.sin(a), -0.5 * math.cos(a), 0), taper=0.7)
        sq(P, (0, 0.08, 0.6), (0.235, 0.16, 0.17), col, nu=14, nv=8)
    elif style == "none":
        return

LOCK_STYLES = {
    "bob": dict(n=30, polar=(0.15, 2.3), length=0.13), "long": dict(n=32, polar=(0.15, 2.3), length=0.14),
    "ponytail": dict(n=24, polar=(0.15, 1.8), length=0.11), "pigtails": dict(n=22, polar=(0.15, 1.7), length=0.1),
    "braids": dict(n=22, polar=(0.15, 1.7), length=0.1), "bun": dict(n=22, polar=(0.15, 1.8), length=0.1),
    "bun_low": dict(n=24, polar=(0.15, 1.9), length=0.1), "short": dict(n=22, polar=(0.2, 1.55), length=0.09),
    "spiky": dict(n=20, polar=(0.2, 1.5), length=0.09), "mop": dict(n=28, polar=(0.15, 2.0), length=0.12),
    "messy": dict(n=26, polar=(0.15, 1.9), length=0.11), "slick": dict(n=22, polar=(0.2, 1.7), length=0.1),
    "shag": dict(n=28, polar=(0.15, 2.1), length=0.12), "wild": dict(n=26, polar=(0.15, 2.0), length=0.11),
    "bald": dict(n=10, polar=(1.15, 1.8), length=0.07),
}

def hair_locks(P, col, style):
    cfg = LOCK_STYLES.get(style)
    if not cfg:
        return
    hl = "hl_" + col[2:] if col.startswith("h_") else lt(col)
    hd = "hd_" + col[2:] if col.startswith("h_") else dk(col)
    pal = [col, hl, col, hd]
    rng = random.Random(sum(map(ord, col)) + 11)
    n, (p0, p1), L = int(cfg["n"] * 0.75), cfg["polar"], cfg["length"]
    c = Vector((0, 0.02, 0.70)); rad = 0.236
    for i in range(n):
        th = 2 * math.pi * (i + rng.uniform(-0.3, 0.3)) / n
        ph = rng.uniform(p0, p1)
        p = Vector((math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)))
        pos = c + Vector((p.x * rad, p.y * rad * 0.95, p.z * rad * 0.93))
        if (p.y < -0.2 and pos.z < 0.81) or (p.y < 0.1 and ph > 1.7 and abs(p.x) < 0.9):
            continue
        if style == "bald" and pos.z > 0.66:
            continue
        d = Vector((math.cos(ph) * math.cos(th), math.cos(ph) * math.sin(th), -math.sin(ph)))
        pos += p * 0.006
        w = 0.048 * rng.uniform(0.8, 1.25)
        sq_dir(P, pos, (w, w * 0.7, L * rng.uniform(0.8, 1.2)), pal[i % 4], d, nu=8, nv=5, taper=0.4)

def hair_style(P, style, col, spec):
    _hair_base(P, style, col, spec)
    hair_locks(P, col, style)

def beard_style(P, kind, col):
    if kind == "mustache":
        sq(P, (0.032, -0.188, 0.628), (0.045, 0.016, 0.014), col, nu=8, nv=5, rot=(0, 0, 0.25), mirror_x=True)
    elif kind == "thin":
        sq(P, (0.03, -0.19, 0.626), (0.035, 0.01, 0.007), col, nu=8, nv=5, rot=(0, 0, 0.15), mirror_x=True)
    elif kind == "goatee":
        sq(P, (0.032, -0.188, 0.628), (0.04, 0.014, 0.012), col, nu=8, nv=5, rot=(0, 0, 0.25), mirror_x=True)
        sq(P, (0, -0.118, 0.525), (0.042, 0.03, 0.035), col, nu=8, nv=6)
    elif kind == "full":
        sq(P, (0, -0.1, 0.545), (0.185, 0.12, 0.12), col, nu=14, nv=8, clip=lambda p: p.z > 0.585 and p.y < -0.05)
        sq(P, (0.032, -0.188, 0.628), (0.05, 0.018, 0.016), col, nu=8, nv=5, rot=(0, 0, 0.25), mirror_x=True)
    elif kind == "stubble":
        sq(P, (0, -0.095, 0.55), (0.19, 0.12, 0.115), col, nu=14, nv=8, clip=lambda p: p.z > 0.58 and p.y < -0.05)

def hat_build(P, kind, col, col2):
    top = 0.855
    if kind == "straw":
        sq(P, (0, 0, 0.835), (0.42, 0.42, 0.035), col, e=(0.6, 1), nu=22, nv=6)
        sq(P, (0, 0, 0.865), (0.225, 0.215, 0.15), col, nu=16, nv=9)
        torus(P, (0, 0, 0.88), 0.222, 0.02, col2, nu=18, nv=6)
    elif kind == "top":
        sq(P, (0, 0, 0.99), (0.165, 0.165, 0.17), col, e=(0.18, 1), nu=18, nv=8)
        sq(P, (0, 0, 0.855), (0.29, 0.29, 0.03), col, e=(0.6, 1), nu=20, nv=6)
        torus(P, (0, 0, 0.9), 0.168, 0.02, col2, nu=18, nv=6)
    elif kind == "peaked":
        sq(P, (0, 0, 0.865), (0.232, 0.225, 0.11), col, nu=16, nv=8)
        torus(P, (0, 0, 0.83), 0.228, 0.022, col2, nu=18, nv=6)
        sq(P, (0, -0.205, 0.835), (0.14, 0.1, 0.018), "black", nu=12, nv=5)
        sph(P, (0, -0.225, 0.885), 0.028, "gold", nu=8, nv=6)
    elif kind == "cap":
        sq(P, (0, 0, 0.865), (0.232, 0.225, 0.115), col, nu=16, nv=8)
        sq(P, (0, -0.2, 0.83), (0.13, 0.11, 0.015), col2, nu=12, nv=5)
        sph(P, (0, 0, 0.98), 0.025, col2, nu=8, nv=6)
    elif kind == "hard":
        sq(P, (0, 0, 0.875), (0.232, 0.225, 0.14), col, nu=16, nv=9)
        sq(P, (0, 0, 0.985), (0.04, 0.2, 0.03), col2, nu=8, nv=5)
        sq(P, (0, -0.06, 0.835), (0.26, 0.27, 0.02), col, e=(0.6, 1), nu=18, nv=5)
    elif kind == "helm":
        sq(P, (0, 0.0, 0.79), (0.245, 0.235, 0.2), col, e=(0.9, 0.9), nu=24, nv=12, clip=lambda p: p.y < -0.07 and p.z < 0.75)
        torus(P, (0, 0.0, 0.752), 0.238, 0.017, col2, nu=26, nv=7)
        sq(P, (0, -0.214, 0.735), (0.034, 0.02, 0.075), col2, e=(0.6, 0.6), nu=10, nv=6)  # nose guard
        sq(P, (0, 0.02, 1.01), (0.025, 0.14, 0.09), "red", nu=8, nv=6, taper=0.5)
        sph(P, (0, -0.02, 1.0), 0.032, "gold", nu=8, nv=6)
    elif kind == "beanie":
        sq(P, (0, 0, 0.85), (0.235, 0.228, 0.14), col, nu=16, nv=9, clip=lambda p: p.z < 0.72 and p.y < -0.05)
        torus(P, (0, 0, 0.775), 0.222, 0.03, col2, nu=18, nv=6)
        sph(P, (0, 0, 0.99), 0.045, col2, nu=10, nv=6)
    elif kind == "sou":
        sq(P, (0, 0, 0.86), (0.235, 0.228, 0.15), col, nu=16, nv=9)
        sq(P, (0, 0.11, 0.80), (0.3, 0.22, 0.02), col, nu=14, nv=5, rot=(0.25, 0, 0))
        sq(P, (0, -0.2, 0.83), (0.15, 0.1, 0.015), col, nu=12, nv=5)
    elif kind == "feather":
        sq(P, (0.0, -0.005, 0.865), (0.235, 0.23, 0.11), col, nu=16, nv=8)
        sq(P, (0, -0.18, 0.84), (0.2, 0.1, 0.02), col, e=(0.6, 1), nu=14, nv=5, rot=(-0.12, 0, 0))
        sq(P, (0.15, 0.04, 0.97), (0.03, 0.03, 0.17), col2, nu=8, nv=6, rot=(0, 0.55, 0), taper=0.7)
    elif kind == "goggles":
        torus(P, (0, 0.01, 0.80), 0.222, 0.018, col2, nu=20, nv=6, rot=(0.12, 0, 0))
        for sx in (-1, 1):
            torus(P, (sx * 0.085, -0.195, 0.835), 0.055, 0.022, col2, rot=(math.pi / 2 - 0.25, 0, 0), nu=16, nv=6)
            sq(P, (sx * 0.085, -0.205, 0.835), (0.05, 0.012, 0.05), col, nu=12, nv=6, rot=(math.pi / 2 - 0.25, 0, 0), e=(1, 1))
    elif kind == "headband":
        torus(P, (0, 0.0, 0.77), 0.205, 0.022, col, nu=20, nv=6, rot=(-0.1, 0, 0))
    elif kind == "crownless_scarf":
        pass

def hat_extras(P, kind, col, col2):
    """Bevelled edges, buckles, gems, rivets."""
    if kind == "straw":
        torus(P, (0, 0, 0.835), 0.405, 0.016, dk(col), nu=26, nv=6)
        sq(P, (0.18, 0.12, 0.84), (0.05, 0.015, 0.012), col2, nu=8, nv=4, rot=(0, 0, 0.8))
        sq(P, (0, -0.215, 0.88), (0.04, 0.014, 0.03), "gold", e=(0.3, 0.3), nu=8, nv=5)
    elif kind == "top":
        torus(P, (0, 0, 0.855), 0.285, 0.016, dk(col), nu=24, nv=6)
        torus(P, (0, 0, 1.15), 0.162, 0.014, lt(col), nu=22, nv=5)
        sq(P, (0, -0.168, 0.9), (0.045, 0.016, 0.04), "gold", e=(0.3, 0.3), nu=8, nv=5)
        sq(P, (0, -0.178, 0.9), (0.026, 0.01, 0.022), dk(col), e=(0.3, 0.3), nu=8, nv=4)
    elif kind in ("peaked", "cap"):
        torus(P, (0, 0, 0.83), 0.232, 0.014, dk(col), nu=22, nv=5) if kind == "cap" else None
        if kind == "peaked":
            torus(P, (0, -0.225, 0.885), 0.04, 0.009, "dark_gold", rot=(math.pi / 2, 0, 0), nu=14, nv=5)
            sph(P, (0, -0.234, 0.885), 0.017, "gem_red", nu=8, nv=6)
            for sx in (-1, 1):
                sph(P, (sx * 0.2, -0.1, 0.835), 0.016, "gold", nu=8, nv=5)
    elif kind == "hard":
        for sx in (-1, 1):
            sq(P, (sx * 0.07, 0, 0.985), (0.015, 0.2, 0.026), lt(col), nu=6, nv=4)
        torus(P, (0, -0.06, 0.835), 0.255, 0.012, dk(col), nu=22, nv=5)
    elif kind == "helm":
        for k in range(9):
            a = -1.5 + k * 0.375
            sph(P, (math.sin(a) * 0.237, -math.cos(a) * 0.226, 0.752), 0.011, "gold", nu=6, nv=4) if abs(a) > 0.3 else None
        sq(P, (0, 0.0, 0.99), (0.016, 0.2, 0.034), "dark_steel", e=(0.7, 0.7), nu=8, nv=6)
    elif kind == "beanie":
        sph(P, (0, 0, 0.99), 0.01, col2, nu=4, nv=3)
        for k in range(8):
            a = k * 0.785
            sq(P, (math.cos(a) * 0.222, math.sin(a) * 0.222, 0.775), (0.012, 0.03, 0.03), dk(col2), nu=5, nv=4, rot=(0, 0, a))
    elif kind == "feather":
        sq(P, (0, -0.215, 0.86), (0.035, 0.012, 0.03), "gold", e=(0.3, 0.3), nu=8, nv=5)
        sph(P, (0, -0.225, 0.86), 0.014, "gem_blue", nu=8, nv=5)
    elif kind == "sou":
        torus(P, (0, 0.11, 0.80), 0.28, 0.012, dk(col), rot=(0.25, 0, 0), nu=22, nv=5)

def glasses_build(P, col, style="round"):
    for sx in (-1, 1):
        torus(P, (sx * 0.078, -0.185, 0.668), 0.047, 0.007, col, rot=(math.pi / 2, 0, 0), nu=18, nv=6)
    sq(P, (0, -0.19, 0.675), (0.025, 0.008, 0.007), col, nu=6, nv=4, rot=(0, math.pi / 2, 0))

def face_build(head, eyel, eyer, mouth, spec):
    skin = spec["skin"]
    rx, ry, rz = spec.get("head_r", (0.205, 0.19, 0.185))
    sq(head, HEAD_C, (rx, ry, rz), skin, e=(0.9, 0.9), nu=26, nv=16)
    # ears (with inner shading), nose, cheeks, brows
    sq(head, (rx - 0.005, 0.0, 0.655), (0.03, 0.03, 0.047), skin, nu=10, nv=7, mirror_x=True)
    sq(head, (rx + 0.014, -0.005, 0.655), (0.012, 0.017, 0.03), "skin_ghost" if spec.get("kind") == "ghost" else "shade", nu=8, nv=5, mirror_x=True)
    sq(head, (0, -ry + 0.012, 0.632), (0.019, 0.026, 0.024), skin, nu=10, nv=7, rot=(math.pi / 2, 0, 0), taper=0.55)
    sph(head, (0.026, -ry + 0.016, 0.62), 0.011, dk(skin), nu=6, nv=4, mirror_x=True)
    if spec.get("blush", True):
        sq(head, (0.115, -0.148, 0.615), (0.034, 0.014, 0.02), "blush", nu=8, nv=6, rot=(0.0, 0.0, 0.5), mirror_x=True)
    hc = spec["hair"][1] if spec["hair"][0] != "bald" else "h_grey"
    bcol = spec.get("brow", ("hd_" + hc[2:]) if hc.startswith("h_") else hc)
    if spec.get("brows", True):
        bz = 0.748 if spec.get("glasses") else 0.722
        sq(head, (0.078, -0.176, bz), (0.042, 0.013, 0.012), bcol, nu=9, nv=6, rot=(0, 0, 0.22), mirror_x=True)
    # eyes: dots with a highlight
    ec = spec.get("eye", "eye")
    er = spec.get("eye_r", (0.03, 0.018, 0.04))
    for P, sx in ((eyel, 1), (eyer, -1)):
        sq(P, (sx * 0.078, -0.173, 0.665), er, ec, nu=10, nv=7)
        sph(P, (sx * 0.078 + sx * 0.008, -0.19, 0.678), 0.0095, "eye_hi", nu=6, nv=4)
    # mouth: small smile dash
    sq(mouth, (0, -0.176, 0.592), (0.03, 0.01, 0.0085), "mouth", nu=10, nv=6)
    sq(mouth, (0.032, -0.173, 0.597), (0.01, 0.008, 0.008), "mouth", nu=6, nv=4, mirror_x=True)

def leg_build(P, SH, sx, spec):
    """P = thigh part (pivot hip), SH = shin part (pivot knee z=0.145), boot belongs to the shin."""
    bot, shoe = spec["bottom"], spec["shoes"]
    w = spec.get("leg_w", 0.062)
    x = sx * 0.075
    skirt_sock = spec.get("skirt") and spec.get("sock")
    tc = spec["skin"] if skirt_sock else bot
    sq(P, (x, 0, 0.2), (w * 1.04, w * 1.04, 0.08), tc, e=(0.8, 1), nu=14, nv=7)
    sph(P, (x, 0, 0.145), w * 1.0, tc, nu=12, nv=8)
    if skirt_sock:
        sq(SH, (x, 0, 0.115), (w * 0.9, w * 0.9, 0.05), spec["skin"], e=(0.8, 1), nu=12, nv=6)
        sq(SH, (x, 0, 0.065), (w * 0.96, w * 0.96, 0.055), spec["sock"], e=(0.8, 1), nu=12, nv=6)
    else:
        sq(SH, (x, 0, 0.098), (w * 0.98, w * 0.98, 0.068), bot, e=(0.8, 1), nu=14, nv=7)
    sq(SH, (x, 0.0, 0.07), (w * 1.08, w * 1.08, 0.065), shoe, e=(0.7, 0.8), nu=14, nv=7)
    sq(SH, (x, -0.04, 0.036), (0.072, 0.105, 0.045), shoe, e=(0.8, 0.8), nu=14, nv=8)
    sq(SH, (x, -0.1, 0.034), (0.058, 0.045, 0.034), lt(shoe), e=(0.8, 0.8), nu=10, nv=6)
    sq(SH, (x, -0.04, 0.008), (0.076, 0.118, 0.013), "black" if shoe != "black" else "dark_steel", e=(0.5, 0.5), nu=14, nv=5)
    torus(SH, (x, 0, 0.125), w * 1.06, 0.012, dk(shoe), nu=14, nv=5)
    if spec.get("cuff"):
        torus(SH, (x, 0, 0.145), w * 1.02, 0.013, spec["cuff"], nu=14, nv=5)

def arm_build(P, H, sx, spec):
    sleeve = spec.get("sleeve", spec["top"])
    short = spec.get("short_sleeve", False)
    x = sx * 0.152
    r = 0.046 * spec.get("arm_w", 1.0)
    sq(P, (x, 0, 0.405), (r, r, 0.075), sleeve, e=(0.8, 1), nu=14, nv=7)
    sq(P, (x, 0, 0.318), (r * 0.94, r * 0.94, 0.075), spec["skin"] if short else sleeve, e=(0.8, 1), nu=14, nv=7)
    if not short:
        torus(P, (x, 0, 0.36), r * 1.0, 0.011, dk(sleeve), nu=14, nv=5)
        torus(P, (x, 0, 0.345), r * 0.98, 0.009, lt(sleeve), nu=14, nv=5)
    if spec.get("cuff") and not short:
        torus(P, (x, 0, 0.256), r * 0.95, 0.012, spec["cuff"], nu=12, nv=5)
    if spec.get("pauldron"):
        sph(P, (x, 0, 0.475), 0.062, spec["pauldron"], nu=12, nv=8)
    gc = spec.get("glove", spec["skin"])
    sq(H, (x, 0, 0.215), (0.05, 0.045, 0.05), gc, e=(0.8, 0.8), nu=14, nv=9)
    sq_dir(H, (x - sx * 0.036, -0.03, 0.222), (0.019, 0.022, 0.035), gc, (-sx * 0.2, -0.45, -1.0), nu=8, nv=6, taper=0.2)
    for k in (-1, 0, 1):
        sq(H, (x + k * 0.016, -0.04, 0.188), (0.011, 0.012, 0.016), dk(gc), nu=6, nv=4)

def torso_build(T, spec):
    top = spec["top"]
    fat = spec.get("fat", 1.0)
    kind = spec.get("kind", "human")
    if kind == "ghost":
        sq(T, (0, 0, 0.33), (0.17, 0.15, 0.27), "skin_ghost", e=(0.9, 1), nu=18, nv=10, taper=-0.25)
        for k in range(7):
            a = 2 * math.pi * k / 7
            sph(T, (math.cos(a) * 0.14, math.sin(a) * 0.12, 0.08), 0.06, "skin_ghost", nu=8, nv=6)
        return
    if kind == "robot":
        sq(T, (0, 0, 0.37), (0.14, 0.11, 0.155), top, e=(0.38, 0.4), nu=16, nv=10)
        sq(T, (0, -0.1, 0.38), (0.075, 0.02, 0.07), "cyan", e=(0.3, 0.3), nu=10, nv=6)
        torus(T, (0, 0, 0.255), 0.14, 0.02, "dark_steel", nu=16, nv=6)
        return
    sq(T, (0, 0, 0.372), (0.133 * fat, 0.106 * fat, 0.162), top, e=(0.7, 0.82), nu=22, nv=12, taper=0.12)
    sq(T, (0, 0, 0.262), (0.126 * fat, 0.1 * fat, 0.05), spec["bottom"], e=(0.7, 0.9), nu=16, nv=7)
    sq(T, (0, 0, 0.51), (0.05, 0.05, 0.04), spec["skin"], nu=10, nv=5)
    if kind == "human":
        sq(T, (0, -0.101 * fat, 0.4), (0.008, 0.012, 0.11), dk(top), nu=6, nv=5)
    for f in spec.get("feats", []):
        name, *a = f if isinstance(f, (tuple, list)) else (f,)
        c = a[0] if a else None
        if name == "vest":
            sq(T, (0, 0, 0.372), (0.138 * fat, 0.111 * fat, 0.162), c, e=(0.7, 0.82), nu=18, nv=10, taper=0.12,
               clip=lambda p: p.z > 0.485 or (abs(p.x) < 0.02 and p.y < -0.03))
        elif name == "tunic":  # longer front panel
            sq(T, (0, 0, 0.33), (0.136 * fat, 0.108 * fat, 0.16), c, e=(0.7, 0.82), nu=18, nv=10, taper=-0.05, clip=lambda p: p.z > 0.46)
        elif name == "belt":
            sq(T, (0, 0, 0.29), (0.131 * fat, 0.112 * fat, 0.02), c, e=(0.35, 0.9), nu=22, nv=6)
            sq(T, (0, -0.112 * fat, 0.29), (0.036, 0.012, 0.03), "gold", e=(0.3, 0.3), nu=10, nv=5)
            sq(T, (0, -0.12 * fat, 0.29), (0.02, 0.008, 0.017), dk(c), e=(0.3, 0.3), nu=8, nv=4)
            sq(T, (0.045, -0.096 * fat, 0.262), (0.015, 0.008, 0.04), c, e=(0.4, 0.4), nu=8, nv=5, rot=(0, 0.1, 0))
        elif name == "collar":
            torus(T, (0, 0, 0.505), 0.083, 0.02, c, nu=18, nv=6)
            for sx in (-1, 1):
                sq(T, (sx * 0.05, -0.085, 0.5), (0.052, 0.014, 0.034), lt(c), e=(0.5, 0.5), nu=10, nv=6, rot=(0.0, sx * 0.15, sx * 0.55))
        elif name == "fur":
            torus(T, (0, 0, 0.5), 0.1 * fat, 0.042, c, nu=16, nv=7)
            for sx in (-1, 1):
                sph(T, (sx * 0.0, -0.1 * fat, 0.42), 0.0001, c, nu=3, nv=3) if False else None
        elif name == "apron":
            sq(T, (0, -0.1 * fat, 0.34), (0.1 * fat, 0.022, 0.14), c, e=(0.5, 0.7), nu=12, nv=8, taper=-0.1)
            sq(T, (0, -0.108 * fat, 0.45), (0.06 * fat, 0.015, 0.045), c, nu=10, nv=6)
        elif name == "skirt":
            sq(T, (0, 0, 0.255), (0.2 * fat, 0.185 * fat, 0.115), c, e=(0.9, 1), nu=20, nv=9, taper=0.38)
        elif name == "overalls":
            sq(T, (0, 0, 0.335), (0.14 * fat, 0.112 * fat, 0.12), c, e=(0.7, 0.82), nu=18, nv=8, taper=0.0, clip=lambda p: p.z > 0.42)
            sq(T, (0, -0.1 * fat, 0.43), (0.075, 0.026, 0.05), c, nu=10, nv=6)
            for sx in (-1, 1):
                sq(T, (sx * 0.065, -0.098, 0.485), (0.014, 0.014, 0.075), c, nu=6, nv=5, rot=(0, 0, 0))
                sph(T, (sx * 0.065, -0.108, 0.435), 0.017, "gold", nu=6, nv=4)
        elif name == "hivis":  # reflective stripes
            for z, wx, wy in ((0.33, 0.127, 0.101), (0.43, 0.117, 0.093)):
                sq(T, (0, 0, z), (wx * fat, wy * fat, 0.013), "white", e=(0.3, 0.9), nu=18, nv=5)
        elif name == "pads":
            for sx in (-1, 1):
                sph(T, (sx * 0.145, 0, 0.5), 0.07, c, nu=12, nv=8)
        elif name == "stetho":
            torus(T, (0, -0.02, 0.5), 0.095, 0.011, "dark_steel", nu=14, nv=5, rot=(0.25, 0, 0))
            sph(T, (0.02, -0.112, 0.37), 0.026, "steel", nu=8, nv=6)
        elif name == "satchel":
            sq(T, (0.0, 0.135, 0.35), (0.1, 0.05, 0.1), c, e=(0.5, 0.6), nu=12, nv=7)
            torus(T, (0, 0, 0.42), 0.135, 0.012, c, rot=(0.0, 0.5, 0), nu=14, nv=5)
        elif name == "lute":
            sq(T, (-0.06, 0.15, 0.33), (0.1, 0.045, 0.13), "tan", e=(0.9, 1), nu=14, nv=8, rot=(0, 0.25, 0))
            sq(T, (-0.0, 0.15, 0.55), (0.02, 0.02, 0.14), "brown", nu=6, nv=5, rot=(0, 0.25, 0))
            sph(T, (-0.04, 0.15, 0.7), 0.03, "brown", nu=8, nv=6)
        elif name == "bowtie":
            for sx in (-1, 1):
                sq(T, (sx * 0.04, -0.09, 0.505), (0.03, 0.015, 0.022), c, nu=8, nv=5)
            sph(T, (0, -0.09, 0.505), 0.014, c, nu=6, nv=4)
        elif name == "toolbelt":
            sq(T, (0, 0, 0.29), (0.127 * fat, 0.103 * fat, 0.022), "dark_brown", e=(0.35, 0.9), nu=18, nv=6)
            for sx in (-1, 1):
                sq(T, (sx * 0.11, -0.07, 0.27), (0.035, 0.03, 0.05), "brown", e=(0.5, 0.5), nu=8, nv=5)
            sq(T, (0.13, -0.02, 0.2), (0.012, 0.012, 0.07), "steel", nu=6, nv=4)
        elif name == "buttons":
            for z in (0.33, 0.4, 0.46):
                sph(T, (0, -0.108 * fat, z), 0.014, c, nu=6, nv=4)
        elif name == "cogwheel":
            torus(T, (0, -0.105, 0.38), 0.045, 0.015, c, rot=(math.pi / 2, 0, 0), nu=12, nv=5)
        elif name == "scarf":
            torus(T, (0, 0, 0.505), 0.092, 0.034, c, nu=16, nv=6)
            sq(T, (0.06, -0.09, 0.42), (0.03, 0.02, 0.08), c, nu=8, nv=5, rot=(0, 0.2, 0))
        elif name == "shawl":
            sq(T, (0, 0.0, 0.43), (0.176 * fat, 0.135 * fat, 0.1), c, e=(0.6, 0.9), nu=18, nv=8, taper=0.45)
        elif name == "trim":  # gold hem + buttons
            torus(T, (0, 0, 0.27), 0.145 * fat, 0.012, c, nu=16, nv=5)
        elif name == "badge":
            sph(T, (0.07, -0.108, 0.45), 0.022, c, nu=8, nv=6)
        elif name == "emblem":  # royal crest on the back so rulers read from behind
            sq(T, (0, 0.1 * fat, 0.375), (0.082, 0.02, 0.095), c, e=(0.5, 0.7), nu=14, nv=8, taper=0.3)
            sq(T, (0, 0.116 * fat, 0.38), (0.052, 0.012, 0.065), "red" if c == "gold" else "gold", e=(0.5, 0.7), nu=12, nv=6, taper=0.3)
            sph(T, (0, 0.124 * fat, 0.385), 0.022, "white", nu=8, nv=6)
            sq(T, (0, 0.0, 0.5), (0.14 * fat, 0.11 * fat, 0.02), c, e=(0.4, 0.9), nu=16, nv=5) if False else None
        elif name == "antenna":
            pass

# ----------------------------------------------------------------- cast
def human(**k):
    d = dict(kind="human", skin="skin_light", hair=("short", "h_brown"), top="white", bottom="brown", shoes="dark_brown", feats=[], S=1.0)
    d.update(k)
    return d

CAST = {
    # ---- rulers (picker) ----
    "ruler-a": human(skin="skin_pale", hair=("bob", "h_chestnut"), top="white", sleeve="white", bottom="navy", shoes="dark_brown",
                     feats=[("vest", "red"), ("belt", "brown"), ("collar", "white"), ("emblem", "gold")], cuff="brown"),
    "ruler-b": human(skin="skin_tan", hair=("short", "h_brown"), top="blue", bottom="navy", shoes="dark_brown", beard="goatee", beard_col="h_brown",
                     feats=[("tunic", "navy"), ("belt", "gold"), ("pads", "gold"), ("collar", "gold"), ("emblem", "gold")], cuff="gold", fat=1.04),
    "ruler-c": human(skin="skin_dark", hair=("afro", "h_black"), top="purple", sleeve="purple", bottom="dark_purple", shoes="gold", skirt=True,
                     feats=[("skirt", "purple"), ("belt", "gold"), ("collar", "pink"), ("emblem", "gold")], cuff="gold", sock="white"),
    "ruler-d": human(skin="skin_olive", hair=("bald", "h_grey"), top="dark_green", bottom="dark_brown", shoes="dark_brown", beard="full", beard_col="h_white",
                     feats=[("fur", "fur"), ("belt", "gold"), ("trim", "gold"), ("emblem", "gold")], cuff="gold", fat=1.1),
    "ruler-e": human(skin="skin_brown", hair=("mop", "h_teal"), top="orange", sleeve="orange", bottom="navy", shoes="teal",
                     feats=[("vest", "teal"), ("belt", "dark_brown"), ("scarf", "yellow"), ("emblem", "gold")], glasses="black"),
    "ruler-f": human(skin="skin_light", hair=("ponytail", "h_blond"), top="pink", sleeve="white", bottom="white", shoes="gold", skirt=True, sock="white",
                     feats=[("skirt", "pink"), ("belt", "gold"), ("collar", "white"), ("emblem", "gold")], cuff="gold", short_sleeve=False),
    # ---- cast ----
    "tilly": human(skin="skin_light", hair=("bun", "h_brown"), top="rust", sleeve="rust", bottom="dark_brown", shoes="black", skirt=True, sock="white",
                   feats=[("skirt", "rust"), ("collar", "white"), ("belt", "dark_brown"), ("badge", "gold")], glasses="gold"),
    "marlo": human(skin="skin_tan", hair=("curly", "h_brown"), top="cream", sleeve="cream", bottom="brown", shoes="dark_brown", beard="mustache", beard_col="h_brown",
                   hat=("feather", "dark_green", "yellow"), feats=[("vest", "green"), ("belt", "dark_brown"), ("satchel", "brown")], fat=1.06),
    "fenwick": human(skin="skin_pale", hair=("slick", "h_black"), top="dark_purple", sleeve="dark_purple", bottom="black", shoes="black", beard="thin", beard_col="h_black",
                     hat=("top", "dark_purple", "gold"), feats=[("tunic", "purple"), ("collar", "gold"), ("bowtie", "red"), ("buttons", "gold")],
                     brow="h_black", cape=("purple", "dark_purple")),
    "hazel": human(skin="skin_light", hair=("braids", "h_red"), top="green", sleeve="cream", bottom="blue", shoes="dark_brown",
                   hat=("straw", "straw", "red"), feats=[("overalls", "blue")], cuff="cream"),
    "benny": human(skin="skin_tan", hair=("shag", "h_blond"), top="orange", sleeve="orange", bottom="brown", shoes="dark_brown",
                   hat=("feather", "red", "white"), feats=[("tunic", "yellow"), ("belt", "dark_brown"), ("lute",)]),
    "rosa": human(skin="skin_brown", hair=("bun_low", "h_grey"), top="pink", sleeve="pink", bottom="dark_purple", shoes="dark_brown", skirt=True, sock="white",
                  feats=[("skirt", "magenta"), ("shawl", "cream"), ("buttons", "gold")], glasses="gold", aid="cane", fat=1.05),
    "clank": human(skin="skin_pale", hair=("none", "h_brown"), top="steel", sleeve="steel", bottom="dark_steel", shoes="dark_steel", glove="dark_steel",
                   hat=("helm", "steel", "dark_steel"), feats=[("belt", "brown"), ("pads", "steel"), ("collar", "dark_steel"), ("badge", "red")],
                   cape=("red", "dark_red"), cuff="dark_steel", pauldron="steel", brow="h_brown", fat=1.08),
    "wren": human(skin="skin_tan", hair=("short", "h_brown"), top="yellow", sleeve="yellow", bottom="tan", shoes="dark_brown", glove="brown",
                  hat=("hard", "yellow", "orange"), feats=[("hivis",), ("toolbelt",)], beard="mustache", beard_col="h_brown", fat=1.04),
    "boo": human(kind="ghost", skin="skin_ghost", hair=("none", "h_white"), top="skin_ghost", bottom="skin_ghost", shoes="skin_ghost", blush=True, brows=False,
                 eye_r=(0.034, 0.02, 0.046), feats=[]),
    "maya": human(skin="skin_brown", hair=("wild", "h_black"), top="teal", sleeve="teal", bottom="dark_steel", shoes="orange",
                  hat=("goggles", "sky", "orange"), feats=[("belt", "orange"), ("collar", "white"), ("badge", "yellow")], aid="wheelchair-power", cuff="orange"),
    "cogs": human(kind="robot", skin="steel", hair=("none", "steel"), top="dark_steel", sleeve="steel", bottom="steel", shoes="dark_steel", glove="steel", eye="cyan",
                  eye_r=(0.034, 0.012, 0.044), blush=False, brows=False, robot=True, feats=[], arm_w=0.8, leg_w=0.05, head_r=(0.2, 0.17, 0.165)),
    "bill": human(skin="skin_light", hair=("none", "h_white"), top="blue", sleeve="blue", bottom="tan", shoes="dark_brown", beard="full", beard_col="h_white",
                  hat=("sou", "yellow", "yellow"), feats=[("overalls", "brown"), ("buttons", "white")], brow="h_white", fat=1.1, cuff="blue"),
    "pip": human(skin="skin_olive", hair=("bob", "h_black"), top="white", sleeve="white", bottom="teal", shoes="white", skirt=False,
                 feats=[("tunic", "white"), ("stetho",), ("collar", "teal"), ("badge", "red")], glasses="black", cuff="teal"),
    "gus": human(skin="skin_dark", hair=("short", "h_black"), top="navy", sleeve="navy", bottom="blue", shoes="black", beard="goatee", beard_col="h_black",
                 hat=("peaked", "navy", "gold"), feats=[("pads", "gold"), ("belt", "dark_brown"), ("buttons", "gold"), ("badge", "gold")], fat=1.1, cuff="gold"),
    "zib": human(skin="skin_green", hair=("none", "h_navy"), top="purple", sleeve="purple", bottom="dark_purple", shoes="magenta", glove="skin_green",
                 feats=[("collar", "steel"), ("belt", "cyan"), ("cogwheel", "yellow")], brow="h_navy", alien=True,
                 head_r=(0.215, 0.195, 0.2), eye_r=(0.042, 0.02, 0.054)),
    "brick": human(skin="skin_brown", hair=("bald", "h_black"), top="dark_red", sleeve="dark_red", bottom="dark_brown", shoes="black", glove="dark_brown",
                   hat=("headband", "red", "red"), beard="full", beard_col="h_black", short_sleeve=True,
                   feats=[("apron", "brown"), ("toolbelt",)], brow="h_black", fat=1.12, arm_w=1.25, S=1.08),
    "prof": human(skin="skin_pale", hair=("messy", "h_grey"), top="cream", sleeve="green", bottom="dark_brown", shoes="brown",
                  feats=[("vest", "green"), ("bowtie", "red"), ("buttons", "brown")], glasses="black", brow="h_grey", beard="mustache", beard_col="h_grey", cuff="brown"),
    "kid": human(skin="skin_tan", hair=("spiky", "h_brown"), top="green", sleeve="green", bottom="blue", shoes="white",
                 hat=None, feats=[("collar", "lime"), ("belt", "dark_brown")], short_sleeve=True),
}

# ----------------------------------------------------------------- figure assembly
def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)

def build_figure(cid, spec, ox=0.0):
    S = spec.get("S", 1.0)
    kind = spec.get("kind", "human")
    ghost = kind == "ghost"
    spec = dict(spec)
    if kind == "robot":
        spec["hair"] = ("none", "steel")
    T = Part("torso", (0, 0, HIP_Z), props=dict(crownY=0.0, float=1 if ghost else 0, noLegs=1 if ghost else 0, kind=kind))
    H = Part("head", NECK, T)
    HAIR = Part("hair", NECK, H)
    EL = Part("eye_l", (0.078 if kind != "robot" else 0.06, -0.173 if kind != "robot" else -0.166, 0.665), H); ER = Part("eye_r", (-0.078 if kind != "robot" else -0.06, -0.173 if kind != "robot" else -0.166, 0.665), H); MO = Part("mouth", NECK, H)
    AL = Part("arm_l", (0.152, 0, SH_Z), T); AR = Part("arm_r", (-0.152, 0, SH_Z), T)
    HL = Part("hand_l", (0.152, 0, 0.255), AL); HR = Part("hand_r", (-0.152, 0, 0.255), AR)
    parts = [T, H, HAIR, EL, ER, MO, AL, AR, HL, HR]
    torso_build(T, spec)
    # head
    if kind == "robot":
        sq(H, HEAD_C, spec["head_r"], "steel", e=(0.34, 0.45), nu=20, nv=12)
        sq(H, (0, -0.142, 0.665), (0.15, 0.03, 0.1), "black", e=(0.35, 0.4), nu=12, nv=8)
        sq(H, (0, 0, 0.87), (0.012, 0.012, 0.09), "dark_steel", nu=6, nv=5)
        sph(H, (0, 0, 0.97), 0.035, "red", nu=10, nv=7)
        for sx in (-1, 1):
            sq(H, (sx * 0.205, 0, 0.67), (0.03, 0.05, 0.05), "dark_steel", e=(0.4, 0.8), nu=10, nv=6, rot=(0, math.pi / 2, 0))
        # eyes sit on the screen
        for P, sx in ((EL, 1), (ER, -1)):
            sq(P, (sx * 0.06, -0.166, 0.67), spec["eye_r"], "cyan", nu=10, nv=6)
        sq(MO, (0, -0.168, 0.60), (0.045, 0.01, 0.008), "cyan", nu=8, nv=4)
    else:
        face_build(H, EL, ER, MO, spec)
        if spec.get("alien"):
            for sx in (-1, 1):
                sq(HAIR, (sx * 0.075, 0.0, 0.88), (0.012, 0.012, 0.1), "skin_green", nu=6, nv=5, rot=(0, sx * 0.25, 0))
                sph(HAIR, (sx * 0.12, 0.0, 0.985), 0.04, "yellow", nu=10, nv=7)
            for sx in (-1, 1):
                sq(H, (sx * 0.155, -0.12, 0.69), (0.01, 0.01, 0.01), "skin_green", nu=3, nv=3) if False else None
        if ghost:
            sq(H, HEAD_C, (0.215, 0.2, 0.2), "skin_ghost", nu=24, nv=14)
    hs = spec["hair"]
    hair_style(HAIR, hs[0], hs[1], spec)
    if spec.get("beard"):
        beard_style(HAIR, spec["beard"], spec.get("beard_col", hs[1]))
    hat = spec.get("hat")
    HAT = None
    if hat:
        HAT = Part("hat", NECK, H)
        hat_build(HAT, hat[0], hat[1], hat[2])
        hat_extras(HAT, hat[0], hat[1], hat[2])
        parts.append(HAT)
    if spec.get("glasses"):
        G = Part("glasses", NECK, H)
        glasses_build(G, spec["glasses"])
        parts.append(G)
    # arms
    if kind == "robot":
        for P, HP, sx in ((AL, HL, 1), (AR, HR, -1)):
            sq(P, (sx * 0.152, 0, 0.36), (0.034, 0.034, 0.12), "dark_steel", nu=10, nv=6)
            sph(P, (sx * 0.152, 0, 0.465), 0.05, "steel", nu=10, nv=7)
            sph(HP, (sx * 0.152, 0, 0.225), 0.05, "steel", nu=10, nv=7)
    elif ghost:
        for P, HP, sx in ((AL, HL, 1), (AR, HR, -1)):
            sq(P, (sx * 0.17, 0, 0.38), (0.045, 0.045, 0.1), "skin_ghost", nu=10, nv=6, rot=(0, sx * 0.0, 0))
            sph(HP, (sx * 0.17, 0, 0.27), 0.05, "skin_ghost", nu=10, nv=6)
    else:
        arm_build(AL, HL, 1, spec); arm_build(AR, HR, -1, spec)
    # cape
    if spec.get("cape"):
        C = Part("cape", (0, 0.06, SH_Z), T)
        sq(C, (0, 0.14, 0.31), (0.15, 0.03, 0.19), spec["cape"][0], e=(0.7, 0.9), nu=12, nv=8, taper=-0.35)
        torus(C, (0, 0.02, 0.485), 0.1, 0.02, spec["cape"][1], nu=16, nv=6)
        for sx in (-1, 1):
            sph(C, (sx * 0.075, -0.075, 0.49), 0.022, "gold", nu=10, nv=7)
            sph(C, (sx * 0.075, -0.093, 0.49), 0.011, "gem_red", nu=8, nv=5)
        torus(C, (0, -0.09, 0.485), 0.07, 0.007, "dark_gold", nu=14, nv=4, rot=(0.5, 0, 0))
        parts.append(C)
    # legs
    legs = []
    if not ghost:
        LL = Part("leg_l", (0.075, 0, HIP_Z)); LR = Part("leg_r", (-0.075, 0, HIP_Z))
        SL = Part("shin_l", (0.075, 0, 0.145), LL); SR = Part("shin_r", (-0.075, 0, 0.145), LR)
        if kind == "robot":
            for P, S2, sx in ((LL, SL, 1), (LR, SR, -1)):
                sq(P, (sx * 0.075, 0, 0.2), (0.05, 0.05, 0.075), "dark_steel", nu=10, nv=6)
                sph(P, (sx * 0.075, 0, 0.145), 0.055, "steel", nu=10, nv=7)
                sq(S2, (sx * 0.075, 0, 0.095), (0.05, 0.05, 0.07), "dark_steel", nu=10, nv=6)
                sq(S2, (sx * 0.075, -0.03, 0.036), (0.075, 0.1, 0.05), "steel", e=(0.5, 0.5), nu=10, nv=6)
        else:
            leg_build(LL, SL, 1, spec); leg_build(LR, SR, -1, spec)
        legs = [LL, LR, SL, SR]
    allp = parts + legs
    # finish in dependency order (parents first)
    for P in allp:
        finish_part(P, S)
    # crown anchor: head top in head-local units
    T.obj["crownY"] = (0.855 + (0.04 if hs[0] in ("bun", "afro", "curly", "spiky", "wild", "messy") else 0.0) - NECK.z) * S
    if spec.get("hat"):
        T.obj["crownY"] = (0.86 - NECK.z) * S
    T.obj["sitDrop"] = 0.0
    if ox:
        for P in (T, *legs):
            P.obj.location.x += ox
    return allp

# ----------------------------------------------------------------- aids
def build_cane():
    P = Part("cane", (0, 0, 0.30))
    sq(P, (0, 0, 0.145), (0.012, 0.012, 0.155), "brown", nu=8, nv=5)
    sq(P, (0, -0.03, 0.30), (0.012, 0.05, 0.014), "brown", e=(1, 1), nu=8, nv=5, rot=(0, 0, 0))
    sph(P, (0, -0.06, 0.29), 0.018, "dark_brown", nu=8, nv=5)
    sph(P, (0, 0, 0.008), 0.016, "black", nu=8, nv=5)
    finish_part(P)
    return [P]

def build_wheelchair(power=False):
    seat_z = 0.215
    C = Part("chair", (0, 0, 0))
    CU = Part("cushion", (0, 0, 0), C)
    seat_c, frame_c, tire = "navy" if not power else "d_teal", "steel", "black"
    sq(CU, (0, 0.0, seat_z - 0.012), (0.155, 0.135, 0.026), seat_c, e=(0.5, 0.6), nu=16, nv=8)
    sq(CU, (0, 0.145, seat_z + 0.15), (0.145, 0.026, 0.165), seat_c, e=(0.5, 0.6), nu=16, nv=8)
    torus(CU, (0, 0.0, seat_z - 0.012), 0.14, 0.006, lt(seat_c), nu=18, nv=4) if False else None
    sq(CU, (0, 0.118, seat_z + 0.15), (0.1, 0.01, 0.12), lt(seat_c), e=(0.5, 0.6), nu=12, nv=6)
    for sx in (-1, 1):
        sq(C, (sx * 0.158, 0.02, seat_z + 0.07), (0.016, 0.1, 0.012), frame_c, nu=8, nv=5)  # armrest
        sq(C, (sx * 0.158, 0.14, seat_z + 0.2), (0.012, 0.012, 0.19), frame_c, nu=8, nv=5)  # back post
        sq(C, (sx * 0.158, 0.17, seat_z + 0.37), (0.012, 0.045, 0.012), "black", nu=8, nv=5)  # push handle
        sq(C, (sx * 0.13, -0.17, 0.2), (0.012, 0.012, 0.1), frame_c, nu=8, nv=5, rot=(-0.55, 0, 0))  # footrest hanger
        sq(C, (sx * 0.08, -0.255, 0.075), (0.065, 0.055, 0.012), "dark_steel", e=(0.5, 0.5), nu=10, nv=5)  # footplate
    if not power:
        sq(C, (0, 0.0, seat_z - 0.06), (0.15, 0.012, 0.012), frame_c, nu=8, nv=5, rot=(0, math.pi / 2, 0))
        for sx in (-1, 1):
            sph(C, (sx * 0.13, -0.19, 0.04), 0.035, tire, nu=10, nv=7)
            sq(C, (sx * 0.13, -0.17, 0.095), (0.01, 0.01, 0.05), frame_c, nu=6, nv=5)
    else:
        sq(C, (0, 0.02, 0.1), (0.15, 0.14, 0.075), "dark_steel", e=(0.4, 0.5), nu=14, nv=8)
        sq(C, (0, 0.0, 0.05), (0.16, 0.19, 0.04), "black", e=(0.4, 0.5), nu=14, nv=7)
        sq(C, (0.155, -0.05, seat_z + 0.1), (0.012, 0.012, 0.045), "black", nu=6, nv=5)  # joystick
        sph(C, (0.155, -0.05, seat_z + 0.15), 0.02, "red", nu=8, nv=6)
        sq(C, (0, 0.145, seat_z + 0.35), (0.07, 0.02, 0.05), "cyan", e=(0.5, 0.5), nu=8, nv=5)
        for sx in (-1, 1):
            sph(C, (sx * 0.15, -0.19, 0.045), 0.045, tire, nu=10, nv=7)
    wheels = []
    r = 0.13 if power else 0.185
    for sx in (-1, 1):
        W = Part("wheel_l" if sx > 0 else "wheel_r", (sx * 0.2, 0.07 if not power else 0.03, r), C)
        wc = Vector((sx * 0.2, 0.07 if not power else 0.03, r))
        torus(W, wc, r * 0.9, 0.016 if not power else 0.028, tire, rot=(0, math.pi / 2, 0), nu=22, nv=7)
        sq(W, wc, (0.02, r * 0.18, r * 0.18), "steel", e=(1, 1), nu=10, nv=6, rot=(0, 0, 0))
        if not power:
            torus(W, wc + Vector((sx * 0.025, 0, 0)), r * 0.78, 0.007, "steel", rot=(0, math.pi / 2, 0), nu=20, nv=5)
            for k in range(6):
                a = k * math.pi / 3
                sq(W, wc, (0.006, 0.006, r * 0.82), "steel", nu=5, nv=4, rot=(a, 0, 0))
        else:
            sq(W, wc, (0.02, r * 0.55, r * 0.55), "grey", e=(1, 1), nu=14, nv=6, rot=(0, math.pi / 2, 0))
        wheels.append(W)
    for P in [C, CU] + wheels:
        finish_part(P)
    return [C, CU] + wheels

# ----------------------------------------------------------------- export + preview
def export(name):
    path = os.path.join(OUT, name + ".glb")
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, export_apply=True,
                              export_yup=True, export_materials="EXPORT", export_animations=False,
                              export_cameras=False, export_lights=False, export_extras=True,
                              export_image_format="AUTO")
    tris = 0
    for o in bpy.data.objects:
        if o.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print("EXPORTED", name, "tris", tris, "bytes", os.path.getsize(path))
    return tris

def setup_preview(n, cols, spacing):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    rows = (n + cols - 1) // cols
    sc.render.resolution_x = int(cols * 300)
    sc.render.resolution_y = int(rows * 400)
    cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"
    aspect = sc.render.resolution_x / sc.render.resolution_y
    cam.ortho_scale = max(cols * spacing, rows * 1.25 * aspect)
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co)
    co.location = ((cols - 1) * spacing / 2, -8, 0.5 - (rows - 1) * 0.625)
    co.rotation_euler = (math.pi / 2, 0, 0)
    sc.camera = co
    for loc, e in (((2, -3, 4), 3.0),):
        l = bpy.data.lights.new("sun", "SUN"); l.energy = 3.2; l.angle = 0.3
        lo = bpy.data.objects.new("sun", l); sc.collection.objects.link(lo)
        lo.rotation_euler = (math.radians(50), 0, math.radians(-25))
    w = bpy.data.worlds.new("w"); w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.95, 0.88, 0.8, 1); bg.inputs[1].default_value = 1.1
    sc.world = w
    sc.view_settings.view_transform = "Standard"

# ----------------------------------------------------------------- owl advisor
def build_owl():
    NK = Vector((0, 0, 0.5))
    B = Part("body", (0, 0, 0))
    H = Part("head", NK, B)
    EL = Part("eye_l", (-0.1, -0.2, 0.69), H); ER = Part("eye_r", (0.1, -0.2, 0.69), H)
    GL = Part("glasses", NK, H); HAT = Part("hat", NK, H)
    WL = Part("wing_l", (-0.22, 0.02, 0.48), B); WR = Part("wing_r", (0.22, 0.02, 0.48), B)
    # body: soft egg with a lighter caramel breast oval and gentle painted scallops (same colour family, no white points)
    sq(B, (0, 0.01, 0.31), (0.27, 0.24, 0.3), "brown", e=(0.9, 0.9), nu=22, nv=12)
    # smooth, gently rounded lighter breast oval; feather read comes from painted chevrons in the atlas tile
    sq(B, (0, -0.125, 0.33), (0.185, 0.105, 0.225), "l_brown", e=(0.95, 0.95), nu=26, nv=16, clip=lambda p: p.z < 0.2,
       uvfn=lambda v: tile_uv((v.x + 0.19) / 0.38, (v.z - 0.1) / 0.46))
    # a soft tuft of feather points where the breast meets the robe
    for k in range(5):
        x = (k - 2) * 0.058
        sq_dir(B, (x, -0.215 + abs(x) * 0.25, 0.4 - abs(x) * 0.18), (0.034, 0.02, 0.055), "l_brown" if k % 2 else "brown", (x * 1.2, -0.25, -1), nu=10, nv=6, taper=0.45)
    # robe: skirt with rounded scalloped hem, collar, gold trim, clasp
    sq(B, (0, 0.0, 0.17), (0.315, 0.295, 0.17), "purple", e=(0.9, 1), nu=24, nv=10, taper=0.22)
    for k in range(14):
        a = k * 2 * math.pi / 14
        sph(B, (math.sin(a) * 0.3, -math.cos(a) * 0.285, 0.07), 0.04, "d_purple", nu=8, nv=5)
    torus(B, (0, 0, 0.038), 0.305, 0.028, "gold", nu=26, nv=7)
    torus(B, (0, 0, 0.1), 0.285, 0.012, "dark_gold", nu=26, nv=5)
    for k in range(9):
        a = k * 2 * math.pi / 9
        sph(B, (math.sin(a) * 0.29, -math.cos(a) * 0.27, 0.07), 0.014, "gold", nu=6, nv=4)
    torus(B, (0, -0.02, 0.42), 0.2, 0.03, "purple", rot=(0.18, 0, 0), nu=22, nv=7)
    sq(B, (0, -0.225, 0.395), (0.04, 0.02, 0.04), "gold", nu=10, nv=6)
    sph(B, (0, -0.243, 0.395), 0.02, "gem_red", nu=8, nv=6)
    for sx in (-1, 1):
        sq(B, (sx * 0.1, -0.2, 0.025), (0.075, 0.11, 0.04), "orange", nu=10, nv=6)
        for k in (-1, 0, 1):
            sph(B, (sx * 0.1 + k * 0.034, -0.275, 0.022), 0.02, "d_orange", nu=6, nv=4)
    # head with a big friendly face disc
    sq(H, (0, 0, 0.67), (0.265, 0.235, 0.225), "brown", e=(0.92, 0.92), nu=24, nv=14)
    sq(H, (0, -0.15, 0.685), (0.225, 0.1, 0.16), "cream", e=(0.9, 0.9), nu=22, nv=12)
    sq(H, (0, -0.145, 0.685), (0.24, 0.1, 0.175), "l_brown", e=(0.9, 0.9), nu=22, nv=12, clip=lambda p: p.y > -0.2) if False else None
    for sx in (-1, 1):
        sq(H, (sx * 0.1, -0.2, 0.69), (0.12, 0.04, 0.125), "l_cream", e=(0.9, 0.9), nu=16, nv=9)
        sq(H, (sx * 0.1, -0.215, 0.795), (0.1, 0.03, 0.03), "white", nu=10, nv=6, rot=(0, 0, sx * -0.3))
        for k in range(3):
            sq_dir(H, (sx * (0.13 + k * 0.035), -0.02, 0.87 + k * 0.012), (0.045 - k * 0.006, 0.04, 0.09 - k * 0.015), ("dark_brown", "brown", "dark_brown")[k], (sx * (0.45 + k * 0.4), 0, 1), nu=8, nv=5, taper=0.45)
    sq(H, (0, -0.265, 0.64), (0.05, 0.06, 0.05), "orange", nu=12, nv=8, rot=(math.pi / 2, 0, 0), taper=0.75)
    sq(H, (0, -0.255, 0.605), (0.036, 0.04, 0.03), "d_orange", nu=10, nv=6, rot=(math.pi / 2, 0, 0), taper=0.7)
    for P, sx in ((EL, -1), (ER, 1)):
        c = (sx * 0.1, -0.2, 0.69)
        sq(P, c, (0.088, 0.058, 0.095), "eye_hi", nu=16, nv=10)
        sq(P, (c[0], -0.248, c[2] - 0.004), (0.056, 0.022, 0.065), "eye", nu=12, nv=8)
        sph(P, (c[0] + sx * 0.014, -0.268, c[2] + 0.024), 0.014, "eye_hi", nu=6, nv=4)
        sph(P, (c[0] - sx * 0.016, -0.262, c[2] - 0.026), 0.007, "eye_hi", nu=5, nv=3)
    for sx in (-1, 1):
        torus(GL, (sx * 0.1, -0.268, 0.69), 0.1, 0.012, "gold", rot=(math.pi / 2, 0, 0), nu=24, nv=7)
        sq(GL, (sx * 0.2, -0.205, 0.7), (0.07, 0.01, 0.01), "gold", nu=6, nv=4)
    sq(GL, (0, -0.27, 0.7), (0.032, 0.01, 0.01), "gold", nu=6, nv=4, rot=(0, math.pi / 2, 0))
    # wizard hat
    sq(HAT, (0, 0.0, 0.875), (0.315, 0.305, 0.03), "purple", e=(0.5, 1), nu=26, nv=6)
    torus(HAT, (0, 0, 0.875), 0.3, 0.017, "d_purple", nu=26, nv=6)
    sq(HAT, (0.02, 0.02, 1.07), (0.17, 0.165, 0.2), "purple", e=(0.9, 0.9), nu=18, nv=10, rot=(0.0, -0.18, 0), taper=0.93)
    torus(HAT, (0.0, 0.0, 0.915), 0.18, 0.024, "gold", nu=22, nv=6)
    sq(HAT, (0.0, -0.18, 0.92), (0.04, 0.014, 0.036), "gold", e=(0.3, 0.3), nu=8, nv=5)
    sq(HAT, (0.0, -0.19, 0.92), (0.024, 0.008, 0.02), "d_purple", e=(0.3, 0.3), nu=8, nv=4)
    for pos, r in (((0.07, -0.1, 0.99), 0.03), ((-0.03, -0.12, 1.1), 0.022), ((0.075, 0.03, 1.27), 0.036), ((-0.08, -0.05, 1.0), 0.016)):
        sph(HAT, pos, r, "gold", nu=8, nv=6)
    # wings: rounded paddles with soft scalloped ends (no points)
    for P, sx in ((WL, -1), (WR, 1)):
        sq(P, (sx * 0.28, 0.03, 0.34), (0.07, 0.14, 0.23), "dark_brown", e=(0.9, 0.9), nu=16, nv=9, rot=(0, sx * -0.1, 0), taper=-0.05)
        for k in range(5):
            y = 0.03 + (k - 2) * 0.052
            sq(P, (sx * 0.292, y, 0.15), (0.05, 0.03, 0.05), "brown" if k % 2 else "d_brown", e=(0.9, 0.9), nu=9, nv=6)
            sq(P, (sx * 0.298, y, 0.22), (0.05, 0.03, 0.05), "d_brown" if k % 2 else "brown", e=(0.9, 0.9), nu=9, nv=6)
        torus(P, (sx * 0.265, 0.03, 0.43), 0.062, 0.016, "gold", rot=(0, sx * math.pi / 2 - sx * 0.12, 0), nu=14, nv=5)
    parts = [B, H, EL, ER, GL, HAT, WL, WR]
    for P in parts:
        finish_part(P)
    return parts

# ----------------------------------------------------------------- crown
def build_crown():
    P = Part("crown", (0, 0, 0))
    sq(P, (0, 0, 0.05), (0.13, 0.13, 0.05), "gold", e=(0.14, 1), nu=30, nv=6)
    torus(P, (0, 0, 0.0), 0.13, 0.014, "dark_gold", nu=30, nv=6)
    torus(P, (0, 0, 0.1), 0.13, 0.014, "l_gold", nu=30, nv=6)
    torus(P, (0, 0, 0.052), 0.133, 0.006, "dark_gold", nu=30, nv=4)
    sq(P, (0, 0, 0.1), (0.122, 0.122, 0.085), "red", e=(0.9, 0.9), nu=22, nv=10, clip=lambda p: p.z < 0.1)
    for k in range(5):
        a = k * 2 * math.pi / 5 + math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        sq(P, (ca * 0.118, sa * 0.118, 0.14), (0.034, 0.03, 0.07), "gold", e=(0.9, 0.9), nu=10, nv=7, taper=0.82)
        sph(P, (ca * 0.118, sa * 0.118, 0.215), 0.02, "pearl", nu=10, nv=7)
        sph(P, (ca * 0.118, sa * 0.118, 0.14), 0.013, ("gem_red", "gem_blue", "gem_green", "gem_pink", "gem_blue")[k], nu=8, nv=6)
        b = a + math.pi / 5
        cb, sb = math.cos(b), math.sin(b)
        sq(P, (cb * 0.128, sb * 0.128, 0.052), (0.026, 0.02, 0.026), ("gem_blue", "gem_red", "gem_green", "gem_red", "gem_pink")[k], nu=10, nv=7)
        eul = Vector((0, 0, 1)).rotation_difference(Vector((cb, sb, 0))).to_euler("XYZ")
        torus(P, (cb * 0.134, sb * 0.134, 0.052), 0.03, 0.007, "dark_gold", rot=(eul.x, eul.y, eul.z), nu=12, nv=5)
        sq(P, (cb * 0.12, sb * 0.12, 0.11), (0.02, 0.018, 0.03), "gold", nu=8, nv=5, taper=0.6)
    finish_part(P)
    return P

# ----------------------------------------------------------------- market food props
GLOSSY = ("cake", "sundae", "donuts", "candy", "wine")

def food_build(fid):
    P = Part("item", (0, 0, 0))
    gloss = fid in GLOSSY
    rng = random.Random(7)
    if fid == "bread":
        sq(P, (0, 0, 0.14), (0.27, 0.16, 0.14), "crust", e=(0.8, 0.7), nu=16, nv=10)
        for x in (-0.1, 0.0, 0.1):
            sq(P, (x, 0, 0.265), (0.035, 0.1, 0.012), "dough", nu=8, nv=5, rot=(0, 0, 0.5))
    elif fid == "milk":
        sq(P, (0, 0, 0.19), (0.115, 0.115, 0.19), "white", e=(0.3, 0.3), nu=14, nv=8)
        sq(P, (0, 0, 0.19), (0.119, 0.119, 0.07), "blue", e=(0.3, 0.3), nu=14, nv=6)
        sq(P, (0, 0, 0.42), (0.115, 0.115, 0.07), "white", e=(0.4, 0.3), nu=14, nv=8, taper=0.75)
        sph(P, (-0.04, -0.12, 0.2), 0.03, "eye", nu=8, nv=5)
        sph(P, (0.04, -0.12, 0.17), 0.022, "eye", nu=8, nv=5)
        sq(P, (0.03, 0, 0.47), (0.04, 0.04, 0.02), "red", nu=8, nv=5)
    elif fid == "carrots":
        for x, y, t in ((-0.09, 0, -0.18), (0.0, 0.04, 0.0), (0.09, 0, 0.18)):
            sq(P, (x, y, 0.22), (0.05, 0.05, 0.22), "orange", nu=10, nv=7, rot=(math.pi, t, 0), e=(0.9, 1))
            sq(P, (x, y, 0.43), (0.045, 0.045, 0.045), "leaf", nu=8, nv=5, taper=0.5)
            for k in range(3):
                sq(P, (x + (k - 1) * 0.03, y, 0.5), (0.02, 0.02, 0.07), "leaf", nu=6, nv=4, rot=(0, (k - 1) * 0.4, 0), taper=0.4)
    elif fid == "cabbage":
        sq(P, (0, 0, 0.19), (0.21, 0.21, 0.18), "green", nu=16, nv=10)
        sq(P, (0, 0, 0.23), (0.19, 0.19, 0.17), "lime", nu=16, nv=10, clip=lambda p: p.z < 0.2)
        for k in range(5):
            a = k * 1.25
            sq(P, (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.2), (0.012, 0.05, 0.14), "vanilla", nu=6, nv=5, rot=(0, 0, a + math.pi / 2))
        sph(P, (0, 0, 0.36), 0.03, "vanilla", nu=6, nv=4)
    elif fid == "apples":
        for x, y, r, c in ((-0.13, 0, 0.14, "red"), (0.13, 0.01, 0.14, "red"), (0.0, 0.13, 0.12, "leaf")):
            sq(P, (x, y, r * 0.95), (r, r, r * 0.92), c, e=(0.9, 1), nu=14, nv=9)
            sq(P, (x, y, r * 1.85), (0.012, 0.012, 0.04), "brown", nu=6, nv=4)
            sq(P, (x + 0.04, y, r * 1.8), (0.05, 0.02, 0.025), "green", nu=8, nv=5, rot=(0, 0, 0.5))
    elif fid == "eggs":
        torus(P, (0, 0, 0.04), 0.17, 0.045, "straw", nu=16, nv=7)
        sq(P, (0, 0, 0.03), (0.17, 0.17, 0.025), "straw", nu=14, nv=5)
        for x, y, c in ((-0.07, -0.05, "cream"), (0.08, -0.04, "white"), (0.0, 0.08, "cream")):
            sq(P, (x, y, 0.15), (0.085, 0.085, 0.115), c, nu=12, nv=8, taper=0.18)
    elif fid == "cheese":
        sq(P, (0, 0, 0.13), (0.24, 0.17, 0.13), "cheese", e=(0.4, 0.4), nu=16, nv=10, rot=(0, 0, 0.35))
        sq(P, (0, 0, 0.26), (0.2, 0.14, 0.02), "foil", e=(0.4, 0.4), nu=12, nv=5, rot=(0, 0, 0.35))
        for x, y, z, r in ((-0.1, -0.14, 0.12, 0.04), (0.08, -0.17, 0.17, 0.03), (0.15, -0.09, 0.08, 0.035), (-0.02, -0.17, 0.06, 0.025)):
            sph(P, (x, y, z), r, "orange", nu=8, nv=5)
    elif fid == "medicine":
        sq(P, (0, 0, 0.17), (0.11, 0.11, 0.17), "glass", e=(0.6, 0.6), nu=14, nv=9)
        sq(P, (0, 0, 0.15), (0.095, 0.095, 0.1), "teal", e=(0.6, 0.6), nu=12, nv=7)
        sq(P, (0, 0, 0.37), (0.05, 0.05, 0.07), "glass", nu=10, nv=6)
        sq(P, (0, 0, 0.45), (0.055, 0.055, 0.045), "brown", nu=10, nv=6)
        sq(P, (0, -0.1, 0.16), (0.07, 0.02, 0.08), "white", e=(0.4, 0.4), nu=10, nv=6)
        sq(P, (0, -0.118, 0.16), (0.045, 0.01, 0.012), "red", nu=6, nv=4)
        sq(P, (0, -0.118, 0.16), (0.012, 0.01, 0.045), "red", nu=6, nv=4)
    elif fid == "candles":
        sq(P, (0, 0, 0.02), (0.22, 0.17, 0.02), "gold", e=(0.5, 1), nu=18, nv=5)
        for x, y, h in ((-0.09, 0.0, 0.2), (0.07, 0.03, 0.28), (0.0, -0.08, 0.16)):
            sq(P, (x, y, 0.04 + h / 2), (0.04, 0.04, h / 2), "cream", e=(0.2, 1), nu=10, nv=6)
            sq(P, (x, y, 0.04 + h + 0.035), (0.022, 0.022, 0.045), "yellow", nu=8, nv=6)
            sq(P, (x, y, 0.04 + h + 0.03), (0.012, 0.012, 0.025), "white", nu=6, nv=4)
    elif fid == "fish":
        sq(P, (0, 0, 0.02), (0.36, 0.22, 0.02), "white", e=(0.4, 1), nu=20, nv=5)
        sq(P, (0, 0, 0.13), (0.27, 0.1, 0.1), "steel", nu=16, nv=10)
        sq(P, (0, -0.03, 0.09), (0.25, 0.08, 0.05), "white", nu=12, nv=6)
        for sz in (-1, 1):
            sq(P, (0.36, 0, 0.13 + sz * 0.065), (0.05, 0.02, 0.1), "blue", nu=8, nv=5, rot=(0, -sz * 0.7, 0), taper=0.6)
        sq(P, (0.0, 0, 0.235), (0.08, 0.015, 0.05), "blue", nu=8, nv=5, taper=0.4)
        sph(P, (-0.2, -0.08, 0.16), 0.03, "eye_hi", nu=8, nv=6)
        sph(P, (-0.21, -0.1, 0.16), 0.015, "eye", nu=6, nv=4)
    elif fid == "cookie":
        sq(P, (0, 0, 0.07), (0.22, 0.22, 0.07), "crust", e=(0.6, 1), nu=18, nv=8)
        for k in range(8):
            a = rng.uniform(0, 6.28); r = rng.uniform(0.02, 0.15)
            sq(P, (math.cos(a) * r, math.sin(a) * r, 0.105), (0.035, 0.035, 0.02), "choc", nu=7, nv=4)
    elif fid == "tea":
        sq(P, (0, 0, 0.02), (0.2, 0.2, 0.02), "sky", e=(0.5, 1), nu=18, nv=5)
        sq(P, (0, 0, 0.12), (0.12, 0.12, 0.1), "white", e=(0.5, 0.9), nu=16, nv=8, taper=-0.2)
        sq(P, (0, 0, 0.215), (0.105, 0.105, 0.012), "brown", nu=14, nv=4)
        torus(P, (0.14, 0, 0.12), 0.05, 0.014, "white", rot=(math.pi / 2, 0, 0), nu=12, nv=6)
        for k in range(2):
            sq(P, (k * 0.03, 0, 0.3 + k * 0.05), (0.012, 0.012, 0.035), "white", nu=6, nv=4, rot=(0, 0.3, 0))
    elif fid == "cake":
        sq(P, (0, 0, 0.1), (0.27, 0.27, 0.1), "dough", e=(0.3, 1), nu=20, nv=8)
        sq(P, (0, 0, 0.2), (0.275, 0.275, 0.035), "fpink", e=(0.3, 1), nu=20, nv=6)
        for k in range(10):
            a = k * 6.28 / 10
            sq(P, (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.17), (0.03, 0.03, 0.045), "fpink", nu=7, nv=5)
        sq(P, (0, 0, 0.3), (0.17, 0.17, 0.08), "dough", e=(0.3, 1), nu=18, nv=8)
        sq(P, (0, 0, 0.375), (0.175, 0.175, 0.03), "fblue", e=(0.3, 1), nu=18, nv=6)
        sph(P, (0, 0, 0.43), 0.04, "red", nu=10, nv=7)
        for k in range(3):
            a = k * 2.1
            sq(P, (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.43), (0.012, 0.012, 0.05), "yellow", nu=6, nv=4)
            sph(P, (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.49), 0.016, "orange", nu=6, nv=4)
        for k in range(8):
            a = rng.uniform(0, 6.28); r = rng.uniform(0.06, 0.24)
            sph(P, (math.cos(a) * r, math.sin(a) * r, 0.225), 0.012, ("foil", "wrap", "fblue")[k % 3], nu=5, nv=4)
    elif fid == "sundae":
        sq(P, (0, 0, 0.012), (0.13, 0.13, 0.012), "glass", nu=14, nv=4)
        sq(P, (0, 0, 0.07), (0.03, 0.03, 0.06), "glass", nu=8, nv=5)
        sq(P, (0, 0, 0.19), (0.16, 0.16, 0.1), "glass", e=(0.8, 1), nu=16, nv=8, taper=0.45)
        for z, c, r in ((0.2, "vanilla", 0.115), (0.3, "fpink", 0.11), (0.39, "choc", 0.095)):
            sph(P, (0, 0, z), r, c, nu=14, nv=9)
        sph(P, (0, 0, 0.49), 0.032, "red", nu=8, nv=6)
        sq(P, (0.08, 0.04, 0.5), (0.025, 0.015, 0.14), "crust", nu=6, nv=4, rot=(0, 0.45, 0.2))
        for k in range(8):
            a = rng.uniform(0, 6.28)
            sph(P, (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.34 + rng.uniform(0, 0.1)), 0.011, ("foil", "wrap", "fblue", "leaf")[k % 4], nu=5, nv=4)
    elif fid == "donuts":
        for i, (x, y, z, c, tilt) in enumerate(((0, 0, 0.06, "fpink", 0.0), (0.03, 0.02, 0.15, "fblue", 0.12), (-0.02, 0.0, 0.24, "foil", -0.1))):
            torus(P, (x, y, z), 0.12, 0.058, "crust", rot=(tilt, 0, 0), nu=20, nv=8)
            torus(P, (x, y, z + 0.022), 0.12, 0.05, c, rot=(tilt, 0, 0), nu=20, nv=8)
            for k in range(7):
                a = k * 0.9 + i
                sq(P, (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, z + 0.075), (0.02, 0.006, 0.006), ("white", "wrap", "leaf", "yellow")[k % 4], nu=5, nv=4, rot=(0, 0, a + 1))
    elif fid == "candy":
        sq(P, (0, 0, 0.07), (0.27, 0.1, 0.06), "wrap", e=(0.35, 0.5), nu=16, nv=8)
        sq(P, (0, 0, 0.07), (0.06, 0.103, 0.062), "foil", e=(0.3, 0.5), nu=12, nv=6)
        for sx in (-1, 1):
            sq(P, (sx * 0.31, 0, 0.07), (0.05, 0.075, 0.05), "wrap", nu=8, nv=6, rot=(0, sx * math.pi / 2, 0), taper=0.5)
        sq(P, (0.0, -0.105, 0.075), (0.2, 0.01, 0.028), "foil", e=(0.4, 0.4), nu=10, nv=4)
    elif fid == "wine":
        sq(P, (0, 0, 0.2), (0.105, 0.105, 0.2), "bpurple", e=(0.6, 0.6), nu=16, nv=10)
        sq(P, (0, 0, 0.43), (0.05, 0.05, 0.1), "bpurple", e=(0.7, 0.7), nu=12, nv=7, taper=-0.1)
        sq(P, (0, 0, 0.53), (0.06, 0.06, 0.05), "foil", nu=12, nv=6)
        sq(P, (0, 0, 0.22), (0.108, 0.108, 0.075), "foil", e=(0.3, 0.3), nu=14, nv=6)
        sph(P, (0, -0.112, 0.225), 0.03, "red", nu=8, nv=6)
        sq(P, (-0.04, -0.07, 0.3), (0.012, 0.012, 0.09), "white", nu=5, nv=4, rot=(0, 0.1, 0))
    finish_part(P, 1.0, gloss)
    return P

FOOD = ["bread", "milk", "carrots", "cabbage", "apples", "eggs", "cheese", "medicine", "candles", "fish",
        "cookie", "tea", "cake", "sundae", "donuts", "candy", "wine"]

def export_path(path):
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, export_apply=True,
                              export_yup=True, export_materials="EXPORT", export_animations=False,
                              export_cameras=False, export_lights=False, export_extras=True)
    print("EXPORTED", os.path.basename(path), os.path.getsize(path))

def lineup_render(path, builders, spacing, cols):
    """builders: list of callables that create one prop each, offset by index."""
    reset_scene()
    n = len(builders)
    for i, b in enumerate(builders):
        parts = b()
        parts = parts if isinstance(parts, list) else [parts]
        for P in parts:
            if P.parent is None:
                P.obj.location.x += (i % cols) * spacing
                P.obj.location.z -= (i // cols) * spacing * 1.2
    sc = bpy.context.scene
    setup_preview(n, cols, spacing)
    rows = (n + cols - 1) // cols
    sc.camera.data.ortho_scale = max(cols * spacing, rows * spacing * 1.2 * sc.render.resolution_x / sc.render.resolution_y)
    sc.camera.location = ((cols - 1) * spacing / 2, -8, spacing * 0.5 - (rows - 1) * spacing * 0.6)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def main():
    palette_material()
    if "--crown" in MODE:
        reset_scene(); build_crown(); export_path(MODE["--crown"]); return
    if "--owl" in MODE:
        reset_scene(); build_owl(); export_path(MODE["--owl"]); return
    if "--owlpreview" in MODE:
        lineup_render(MODE["--owlpreview"], [build_owl], 1.6, 1); return
    if "--food" in MODE:
        os.makedirs(MODE["--food"], exist_ok=True)
        for fid in FOOD:
            reset_scene(); food_build(fid); export_path(os.path.join(MODE["--food"], fid + ".glb"))
        return
    if "--foodpreview" in MODE:
        lineup_render(MODE["--foodpreview"], [(lambda f=f: food_build(f)) for f in FOOD], 0.8, 6); return
    ids = ONLY or list(CAST.keys())
    if PREVIEW:
        reset_scene()
        cols = min(len(ids), 6)
        spacing = 0.7
        for n, cid in enumerate(ids):
            ox = (n % cols) * spacing
            if cid.startswith("wheelchair"):
                parts = build_wheelchair(cid.endswith("power"))
            elif cid == "cane":
                parts = build_cane()
            else:
                parts = build_figure(cid, CAST[cid], 0.0)
            row = n // cols
            for P in parts:
                if P.parent is None:
                    P.obj.location.x += ox
                    P.obj.location.z -= row * 1.25
        setup_preview(len(ids), cols, spacing)
        sc = bpy.context.scene
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        print("PREVIEW", PREVIEW)
        return
    if PORTRAITS:
        os.makedirs(PORTRAITS, exist_ok=True)
        for cid in ids:
            if cid not in CAST: continue
            reset_scene()
            build_figure(cid, CAST[cid])
            sc = bpy.context.scene
            setup_preview(1, 1, 0.7)
            sc.render.resolution_x, sc.render.resolution_y = 360, 440
            sc.camera.data.ortho_scale = 1.06
            sc.camera.location = (0, -8, 0.5)
            sc.render.film_transparent = True
            sc.render.filepath = os.path.join(PORTRAITS, cid + ".png")
            sc.render.image_settings.color_mode = "RGBA"
            bpy.ops.render.render(write_still=True)
            bpy.data.objects.remove(sc.camera, do_unlink=True)
            print("PORTRAIT", cid)
        return
    report = {}
    for cid in ids:
        reset_scene()
        build_figure(cid, CAST[cid])
        report[cid] = export(cid)
    if not ONLY:
        reset_scene(); build_cane(); report["cane"] = export("cane")
        reset_scene(); build_wheelchair(False); report["wheelchair"] = export("wheelchair")
        reset_scene(); build_wheelchair(True); report["wheelchair-power"] = export("wheelchair-power")
    print("REPORT", report)

main()

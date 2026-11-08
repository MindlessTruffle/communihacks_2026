"""
Royal Concerns - environment kit (mid-poly, soft, painterly), vertex-colour palette + baked AO.
Run in BACKGROUND Blender only (never the user's live session):
  "E:/Steam/steamapps/common/Blender/blender.exe" -b --factory-startup -P tools/blender/gen_env.py -- E:/RoyalConcerns/game/public/models/env [asset names...]
Every asset is ONE mesh with two material slots: "env" (vertex colours, matte) and "glow" (warm window/lantern glass).
Authoring space is three.js space: x right, y UP, z toward the viewer (front of houses = +z).  Converted on export.
Palette lives in P below; baked AO = per-vertex shading (height in piece, under-canopy darkening, contact darkening near ground).
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = globals().get("OUT") or (argv[0] if argv else os.path.join(os.getcwd(), "public", "models", "env"))
ONLY = set(argv[1:]) if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# ------------------------------------------------------------------ palette (sRGB hex)
P = dict(
    leaf_deep="#27706f", leaf_mid="#37917f", leaf_lt="#5eb08a", leaf_olive="#8fb23c", leaf_lime="#b6cc4e", leaf_pine="#235f66",
    bark="#7a5543", bark_d="#573b30", bark_l="#a07a5c",
    plaster="#f0e4c8", plaster_b="#ecd2b4", plaster_c="#e6dcc8", timber="#80502f", timber_d="#5c3a24", timber_l="#a8683c",
    roof_a="#cb5a3c", roof_b="#dc7249", roof_c="#b94a36", roof_blue="#4f7fa0", roof_blue_b="#628fb0",
    stone="#b4b0a8", stone_l="#d2cdc2", stone_d="#8d8a86", teal="#3e8c90", mustard="#e0a937", pink="#e56f93", cream="#f6ecd2",
    iron="#3d3b47", gold="#eab43a", gold_d="#c68a22", velvet="#c2323c", velvet_d="#8f2330", purple="#7a4fb5",
    grass="#7fbf45", grass_d="#4f9a37", grass_l="#b7dc63", dirt="#d9b783", wood_fence="#b0703f", wood_fence_d="#7d4b2c",
    f_pink="#f07aa6", f_yellow="#f8d84a", f_white="#fff1de", f_purple="#a283e6", f_orange="#f59a3a",
    water="#6cc4d6", flag_red="#d2433f", flag_green="#4f9a5a", glass="#ffd98a",
)
C = {k: lin(v) for k, v in P.items()}

FROM_THREE = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # (x,y,z)_three -> (x,-z,y)_blender


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mul(c, m):
    return tuple(c[i] * m[i] for i in range(3))


DARK = (0.66, 0.68, 0.84)  # cool, soft AO tint
HI = (1.06, 1.03, 0.94)    # warm lift


def shade(col, k, jit=1.0):
    m = mix(DARK, HI, clamp(k))
    return tuple(max(0.0, min(1.6, col[i] * m[i] * jit)) for i in range(3))


def vnoise(d, s):
    return (math.sin(d.x * 2.7 + s) + math.sin(d.y * 3.3 + s * 1.7) + math.sin(d.z * 2.9 + s * 2.3)) / 3.0


class Builder:
    def __init__(self, name, seed=1, ground_ao=True):
        self.name = name
        self.bm = bmesh.new()
        self.layer = self.bm.verts.layers.color.new("Col")
        self.stack = [Matrix.Identity(4)]
        self.rng = random.Random(seed * 7919 + 17)
        self.seed = seed
        self.ground_ao = ground_ao

    # ---- transform stack
    @property
    def M(self):
        return self.stack[-1]

    def push(self, pos=(0, 0, 0), rotY=0.0, scale=1.0):
        m = self.M @ Matrix.Translation(Vector(pos)) @ Matrix.Rotation(rotY, 4, "Y") @ Matrix.Scale(scale, 4)
        self.stack.append(m)
        return self

    def pop(self):
        self.stack.pop()

    # ---- commit a temp bmesh (already coloured) into the main one
    def _commit(self, t, tl, mat=0, smooth=False):
        bmesh.ops.transform(t, matrix=self.M, verts=t.verts[:])
        vm = {}
        for v in t.verts:
            nv = self.bm.verts.new(v.co)
            nv[self.layer] = v[tl]
            vm[v] = nv
        for f in t.faces:
            try:
                nf = self.bm.faces.new([vm[v] for v in f.verts])
            except ValueError:
                continue
            nf.smooth = smooth
            nf.material_index = mat
        t.free()

    def _tmp(self):
        t = bmesh.new()
        return t, t.verts.layers.color.new("Col")

    # ---- primitives
    def box(self, c, size, col, bevel=0.03, rot=(0, 0, 0), ao=0.2, mat=0, segs=1, jit=0.04, top=0.0, gz=0.0):
        t, tl = self._tmp()
        bmesh.ops.create_cube(t, size=1.0)
        bmesh.ops.transform(t, matrix=Matrix.Diagonal((size[0], size[1], size[2], 1)), verts=t.verts[:])
        if bevel > 0:
            bmesh.ops.bevel(t, geom=t.edges[:], offset=min(bevel, min(size) * 0.45), offset_type="OFFSET", segments=segs, profile=0.5, affect="EDGES")
        t.normal_update()
        j = 1.0 + self.rng.uniform(-jit, jit)
        for v in t.verts:
            hh = v.co.y / max(size[1], 1e-4) + 0.5
            k = 0.55 + 0.25 * (hh - 0.5) * 2 * (ao * 2.5) + 0.12 * v.normal.y + top + gz * (v.co.z / max(size[2], 1e-4)) * 0.5
            v[tl] = (*shade(col, k, j), 1.0)
        R = Matrix.Translation(Vector(c)) @ (Euler_mat(rot))
        bmesh.ops.transform(t, matrix=R, verts=t.verts[:])
        self._commit(t, tl, mat, smooth=False)

    def blob(self, c, r, col, sub=2, noise=0.1, flat=False, cc=None, R=None, rot=(0, 0, 0), mat=0, kbias=0.0, jit=0.06):
        rx, ry, rz = (r, r, r) if isinstance(r, (int, float)) else r
        t, tl = self._tmp()
        bmesh.ops.create_icosphere(t, subdivisions=sub, radius=1.0)
        s = self.rng.uniform(0, 100)
        j = 1.0 + self.rng.uniform(-jit, jit)
        for v in t.verts:
            d = v.co.normalized()
            n = 1.0 + noise * vnoise(d, s)
            v.co = Vector((d.x * rx * n, d.y * ry * n, d.z * rz * n))
        t.normal_update()
        Rm = Matrix.Translation(Vector(c)) @ Euler_mat(rot)
        for v in t.verts:
            d = v.co.normalized()
            kk = d.y * 0.5 + 0.5
            if cc is not None:
                wp = Vector(c) + v.co
                kk = 0.45 * kk + 0.55 * clamp((wp.y - cc[1]) / max(R, 0.01) * 0.5 + 0.5)
            v[tl] = (*shade(col, 0.25 + 0.75 * kk + kbias, j), 1.0)
        bmesh.ops.transform(t, matrix=Rm, verts=t.verts[:])
        self._commit(t, tl, mat, smooth=not flat)

    def tube(self, pts, radii, col, seg=8, colB=None, ao=0.35, caps=True, mat=0, smooth=True, jit=0.04):
        t, tl = self._tmp()
        n = len(pts)
        P_ = [Vector(p) for p in pts]
        rings = []
        j = 1.0 + self.rng.uniform(-jit, jit)
        for i in range(n):
            if i == 0:
                T = P_[1] - P_[0]
            elif i == n - 1:
                T = P_[-1] - P_[-2]
            else:
                T = P_[i + 1] - P_[i - 1]
            T.normalize()
            U = Vector((0, 1, 0)) if abs(T.y) < 0.9 else Vector((1, 0, 0))
            N = T.cross(U).normalized()
            Bn = T.cross(N).normalized()
            ring = []
            f = i / max(n - 1, 1)
            base = mix(col, colB, f) if colB else col
            for s_ in range(seg):
                a = s_ / seg * math.tau
                p = P_[i] + (N * math.cos(a) + Bn * math.sin(a)) * radii[i]
                v = t.verts.new(p)
                v[tl] = (*shade(base, 1.0 - ao + ao * f * 1.4 + 0.1 * math.sin(a), j), 1.0)
                ring.append(v)
            rings.append(ring)
        for i in range(n - 1):
            for s_ in range(seg):
                a, b2 = rings[i][s_], rings[i][(s_ + 1) % seg]
                c2, d2 = rings[i + 1][(s_ + 1) % seg], rings[i + 1][s_]
                try:
                    t.faces.new((a, b2, c2, d2))
                except ValueError:
                    pass
        if caps:
            for ring in (rings[0], rings[-1][::-1]):
                try:
                    t.faces.new(ring)
                except ValueError:
                    pass
        t.normal_update()
        bmesh.ops.recalc_face_normals(t, faces=t.faces[:])
        # make sure it faces outward (centroid test)
        cen = sum(P_, Vector()) / n
        f0 = t.faces[0]
        if (f0.calc_center_median() - cen).dot(f0.normal) < 0:
            bmesh.ops.reverse_faces(t, faces=t.faces[:])
        self._commit(t, tl, mat, smooth=smooth)

    def cyl(self, c, r, h, col, r2=None, seg=12, axis="y", colB=None, ao=0.3, bev=0.0, mat=0, smooth=True):
        r2 = r if r2 is None else r2
        c = Vector(c)
        ax = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[axis]
        a, b = c - ax * h / 2, c + ax * h / 2
        if bev > 0:
            pts = [a, a + ax * bev, b - ax * bev, b]
            rad = [r * 0.82, r, r2, r2 * 0.82]
            self.tube(pts, rad, col, seg, colB, ao, True, mat, smooth)
        else:
            self.tube([a, b], [r, r2], col, seg, colB, ao, True, mat, smooth)

    def prism(self, profile, length, col, axis_x=True, bevel=0.0, ao=0.2, mat=0, c=(0, 0, 0)):
        """profile = [(z,y)...] extruded along x by `length` (centered)."""
        t, tl = self._tmp()
        ys = [p[1] for p in profile]
        y0, y1 = min(ys), max(ys)
        loops = []
        for x in (-length / 2, length / 2):
            lp = []
            for (z, y) in profile:
                v = t.verts.new((x, y, z))
                v[tl] = (*shade(col, 0.5 + ao * ((y - y0) / max(y1 - y0, 1e-3) - 0.5) * 2.0), 1.0)
                lp.append(v)
            loops.append(lp)
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            t.faces.new((loops[0][i], loops[0][j], loops[1][j], loops[1][i]))
        t.faces.new(loops[0][::-1])
        t.faces.new(loops[1])
        t.normal_update()
        bmesh.ops.recalc_face_normals(t, faces=t.faces[:])
        bmesh.ops.transform(t, matrix=Matrix.Translation(Vector(c)), verts=t.verts[:])
        self._commit(t, tl, mat, False)

    # ---- finalize
    def build(self):
        bm = self.bm
        if self.ground_ao:
            for v in bm.verts:
                y = v.co.y
                if y < 0.7:
                    f = 0.68 + 0.32 * clamp(y / 0.7)
                    f = f * f * (3 - 2 * f) if False else f
                    c = v[self.layer]
                    v[self.layer] = (c[0] * f, c[1] * f, c[2] * f * 1.02, 1.0)
        # the glTF exporter treats colour attributes as sRGB-encoded and linearises them -> pre-encode
        for v in bm.verts:
            c = v[self.layer]
            v[self.layer] = tuple((x * 12.92 if x <= 0.0031308 else 1.055 * (max(x, 0.0) ** (1 / 2.4)) - 0.055) for x in c[:3]) + (1.0,)
        bmesh.ops.transform(bm, matrix=FROM_THREE, verts=bm.verts[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(MAT_ENV)
        me.materials.append(MAT_GLOW)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def Euler_mat(rot):
    from mathutils import Euler
    return Euler(rot, "XYZ").to_matrix().to_4x4()


# ------------------------------------------------------------------ materials
def make_materials():
    me = bpy.data.materials.new("env")
    me.use_nodes = True
    nt = me.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    an = nt.nodes.new("ShaderNodeAttribute")
    an.attribute_name = "Col"
    an.attribute_type = "GEOMETRY"
    nt.links.new(an.outputs["Color"], bsdf.inputs["Base Color"])
    mg = bpy.data.materials.new("glow")
    mg.use_nodes = True
    b2 = mg.node_tree.nodes["Principled BSDF"]
    b2.inputs["Base Color"].default_value = (*C["glass"], 1)
    b2.inputs["Emission Color"].default_value = (*C["glass"], 1)
    b2.inputs["Emission Strength"].default_value = 1.0
    return me, mg


MAT_ENV, MAT_GLOW = make_materials()

STATS = {}


def export(ob):
    path = os.path.join(OUT, ob.name + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_materials="EXPORT", export_animations=False, export_vertex_color="MATERIAL",
              export_active_vertex_color_when_no_material=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop("export_vertex_color", None)
        bpy.ops.export_scene.gltf(**kw)
    STATS[ob.name] = (len(ob.data.polygons), os.path.getsize(path) // 1024)
    bpy.data.objects.remove(ob, do_unlink=True)


ASSETS = {}


def asset(fn):
    ASSETS[fn.__name__] = fn
    return fn


# ====================================================================== PLANTS
def canopy_colors(kind):
    if kind == "teal":
        return [C["leaf_deep"], C["leaf_mid"], C["leaf_mid"], C["leaf_lt"]]
    if kind == "olive":
        return [C["leaf_olive"], C["leaf_lime"], C["leaf_olive"], mix(C["leaf_olive"], C["leaf_mid"], 0.4)]
    return [C["leaf_pine"], C["leaf_deep"], C["leaf_pine"], C["leaf_mid"]]


def oak(name, seed, height=7.0, crown=3.5, kind="teal", twist=1.0):
    b = Builder(name, seed)
    rng = b.rng
    n = 8
    pts, rad = [], []
    for i in range(n + 1):
        t = i / n
        a = t * 2.6 * twist + seed
        off = 0.42 * t * t * twist
        pts.append((math.cos(a) * off, t * height * 0.55, math.sin(a) * off))
        rad.append(0.62 * (1 - t * 0.5))
    rad[0], rad[1] = 0.95, 0.72
    b.tube(pts, rad, C["bark"], 10, C["bark_l"], ao=0.45)
    for k in range(5):  # buttress roots
        a = k / 5 * math.tau + seed
        b.tube([(math.cos(a) * 0.3, 0.55, math.sin(a) * 0.3), (math.cos(a) * 0.75, 0.22, math.sin(a) * 0.75), (math.cos(a) * 1.25, 0.0, math.sin(a) * 1.25)],
               [0.26, 0.2, 0.1], C["bark_d"], 6, C["bark"], ao=0.5)
    top = Vector(pts[-1])
    cy = height * 0.74
    cc = (top.x, cy, top.z)
    cols = canopy_colors(kind)
    for k in range(3):  # branches into crown
        a = k / 3 * math.tau + seed * 2
        b.tube([(top.x, top.y - 0.5, top.z), (top.x + math.cos(a) * 0.9, top.y + 0.5, top.z + math.sin(a) * 0.9), (top.x + math.cos(a) * 1.8, cy - 0.3, top.z + math.sin(a) * 1.8)],
               [0.26, 0.2, 0.12], C["bark_d"], 6, C["bark"], ao=0.3)
    blobs = []
    for k in range(7):
        a = k / 7 * math.tau + rng.uniform(-0.3, 0.3)
        rr = crown * rng.uniform(0.5, 0.68)
        blobs.append((cc[0] + math.cos(a) * rr, cy + rng.uniform(-0.55, 0.45), cc[2] + math.sin(a) * rr, crown * rng.uniform(0.42, 0.55)))
    for k in range(3):
        a = k / 3 * math.tau + 0.7
        blobs.append((cc[0] + math.cos(a) * crown * 0.25, cy + crown * rng.uniform(0.38, 0.55), cc[2] + math.sin(a) * crown * 0.25, crown * rng.uniform(0.42, 0.5)))
    blobs.append((cc[0], cy - 0.1, cc[2], crown * 0.6))
    for (x, y, z, r) in blobs:
        b.blob((x, y, z), (r * 1.05, r * 0.82, r * 1.05), rng.choice(cols), sub=2, noise=0.16, cc=cc, R=crown * 1.1, jit=0.05)
    return b.build()


@asset
def tree_oak_a():
    return oak("tree_oak_a", 1, 7.2, 3.6, "teal", 1.0)


@asset
def tree_oak_b():
    return oak("tree_oak_b", 5, 6.2, 3.2, "teal", -1.3)


@asset
def tree_olive():
    return oak("tree_olive", 9, 5.6, 2.9, "olive", 0.7)


@asset
def tree_round():
    b = Builder("tree_round", 3)
    b.tube([(0, 0, 0), (0.05, 1.2, 0), (0.0, 2.3, 0.05)], [0.4, 0.28, 0.22], C["bark"], 8, C["bark_l"], ao=0.45)
    cc = (0, 3.6, 0)
    cols = canopy_colors("olive")
    for (x, y, z, r) in [(0, 3.5, 0, 1.7), (1.0, 3.2, 0.4, 1.1), (-0.9, 3.4, -0.3, 1.2), (0.2, 4.4, 0.2, 1.2), (-0.3, 3.1, 1.0, 1.0), (0.5, 3.0, -1.0, 1.0)]:
        b.blob((x, y, z), r, b.rng.choice(cols), 2, 0.14, cc=cc, R=2.4)
    return b.build()


@asset
def tree_pine():
    b = Builder("tree_pine", 4)
    b.tube([(0, 0, 0), (0, 1.8, 0)], [0.34, 0.24], C["bark_d"], 8, None, ao=0.4)
    cols = canopy_colors("pine")
    cc = (0, 3.5, 0)
    for i, (y, r) in enumerate([(1.9, 1.9), (3.0, 1.55), (4.0, 1.2), (4.85, 0.85), (5.5, 0.5)]):
        b.blob((0, y, 0), (r, r * 0.7, r), cols[i % 4], 2, 0.12, cc=cc, R=3.5)
    return b.build()


@asset
def tree_small():
    b = Builder("tree_small", 6)
    b.tube([(0, 0, 0), (0.08, 0.9, 0.0), (0.0, 1.6, 0.05)], [0.22, 0.15, 0.12], C["bark"], 7, C["bark_l"], ao=0.4)
    cc = (0, 2.4, 0)
    for (x, y, z, r) in [(0, 2.4, 0, 1.1), (0.7, 2.1, 0.2, 0.7), (-0.6, 2.2, -0.2, 0.75), (0.1, 3.0, 0, 0.7)]:
        b.blob((x, y, z), r, b.rng.choice(canopy_colors("teal")), 2, 0.15, cc=cc, R=1.6)
    return b.build()


def bush(name, seed, flowers=None, r=0.9):
    b = Builder(name, seed)
    cols = [C["leaf_lt"], mix(C["leaf_mid"], C["leaf_olive"], 0.45), C["leaf_mid"], mix(C["leaf_lt"], C["leaf_olive"], 0.5)]
    cc = (0, r * 0.8, 0)
    for (x, y, z, rr) in [(0, 0.62, 0, 1.0), (0.75, 0.5, 0.2, 0.7), (-0.7, 0.5, -0.1, 0.72), (0.2, 0.52, 0.7, 0.62), (-0.1, 0.9, -0.1, 0.62)]:
        b.blob((x * r, y * r, z * r), (rr * r, rr * r * 0.82, rr * r), b.rng.choice(cols), 2, 0.2, cc=cc, R=r * 1.4)
    if flowers:
        for k in range(10):
            a = b.rng.uniform(0, math.tau)
            e = b.rng.uniform(0.15, 1.0)
            d = Vector((math.cos(a) * math.sin(e), math.cos(e), math.sin(a) * math.sin(e)))
            p = d * r * 0.95 + Vector((0, 0.45 * r, 0))
            if p.y < 0.3:
                continue
            b.blob(tuple(p), 0.1, C[flowers], 1, 0.0, flat=True, kbias=0.35)
    return b.build()


@asset
def bush_a():
    return bush("bush_a", 2)


@asset
def bush_b():
    return bush("bush_b", 8, None, 0.7)


@asset
def bush_pink():
    return bush("bush_pink", 3, "f_pink")


@asset
def bush_white():
    return bush("bush_white", 12, "f_white", 0.8)


def flowers(name, seed, col, col2=None, n=7, r=0.45):
    b = Builder(name, seed, ground_ao=False)
    rng = b.rng
    b.blob((0, 0.08, 0), (r * 1.1, 0.16, r * 1.1), C["leaf_mid"], 1, 0.15)
    for k in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.02, r)
        x, z = math.cos(a) * d, math.sin(a) * d
        h = rng.uniform(0.28, 0.55)
        b.tube([(x, 0.05, z), (x + rng.uniform(-0.05, 0.05), h * 0.55, z + rng.uniform(-0.05, 0.05)), (x, h, z)], [0.022, 0.018, 0.016], C["leaf_mid"], 4, C["leaf_lt"], ao=0.2, caps=False)
        cc_ = col if (col2 is None or k % 3) else col2
        b.blob((x, h + 0.04, z), (0.12, 0.07, 0.12), cc_, 1, 0.1, flat=True, kbias=0.35)
        b.blob((x, h + 0.075, z), 0.04, C["gold"], 0, 0.0, flat=True, kbias=0.3)
    return b.build()


@asset
def flowers_pink():
    return flowers("flowers_pink", 1, C["f_pink"], C["f_white"])


@asset
def flowers_yellow():
    return flowers("flowers_yellow", 2, C["f_yellow"], C["f_orange"])


@asset
def flowers_white():
    return flowers("flowers_white", 3, C["f_white"], C["f_pink"])


@asset
def flowers_purple():
    return flowers("flowers_purple", 4, C["f_purple"], C["f_white"])


@asset
def tuft():
    b = Builder("tuft", 5, ground_ao=False)
    rng = b.rng
    for k in range(9):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.0, 0.18)
        x, z = math.cos(a) * d, math.sin(a) * d
        h = rng.uniform(0.35, 0.75)
        lean = rng.uniform(0.08, 0.3)
        lx, lz = math.cos(a) * lean, math.sin(a) * lean
        b.tube([(x, 0, z), (x + lx * 0.3, h * 0.5, z + lz * 0.3), (x + lx * 0.8, h * 0.85, z + lz * 0.8), (x + lx * 1.3, h, z + lz * 1.3)],
               [0.045, 0.04, 0.026, 0.004], C["grass_d"], 3, C["grass_l"], ao=0.2, caps=False)
    return b.build()


# ====================================================================== ROCKS
def rock(name, seed, r=0.6, squash=0.65, col="stone"):
    b = Builder(name, seed)
    b.blob((0, r * squash * 0.55, 0), (r, r * squash, r * 0.9), C[col], 2, 0.32, kbias=-0.05)
    if seed % 2:
        b.blob((r * 0.7, r * 0.2, r * 0.3), (r * 0.45, r * 0.32, r * 0.4), C["stone_l"], 1, 0.3)
    return b.build()


@asset
def rock_a():
    return rock("rock_a", 1, 0.75)


@asset
def rock_b():
    return rock("rock_b", 2, 0.5, 0.8)


@asset
def rock_c():
    return rock("rock_c", 3, 1.1, 0.6, "stone_l")


@asset
def path_stone():
    b = Builder("path_stone", 2)
    b.blob((0, 0.06, 0), (0.34, 0.1, 0.26), C["stone_l"], 1, 0.22)
    return b.build()


# ====================================================================== PROPS
@asset
def fence():
    b = Builder("fence", 3)
    rng = b.rng
    L = 2.0
    for x in (-L / 2, L / 2):
        b.box((x, 0.5, 0), (0.17, 1.0, 0.17), C["wood_fence"], 0.04, ao=0.25, segs=2)
        b.blob((x, 1.0, 0), (0.1, 0.07, 0.1), C["wood_fence"], 1, 0.05, kbias=0.15)
    for y in (0.4, 0.78):
        b.box((0, y, 0.0), (L + 0.1, 0.13, 0.1), C["wood_fence"], 0.035, rot=(0, 0, rng.uniform(-0.02, 0.02)), segs=2)
        b.box((0, y - 0.02, -0.09), (L - 0.1, 0.07, 0.04), C["wood_fence_d"], 0.02)
    return b.build()


@asset
def lamp_post():
    b = Builder("lamp_post", 2)
    b.cyl((0, 0.18, 0), 0.26, 0.36, C["stone"], 0.2, 8, bev=0.05)
    b.cyl((0, 1.6, 0), 0.07, 2.9, C["iron"], 0.05, 8, ao=0.2)
    b.cyl((0, 0.55, 0), 0.12, 0.2, C["iron"], 0.12, 8)
    b.tube([(0, 2.7, 0), (0.1, 3.0, 0), (0.5, 3.1, 0), (0.7, 2.95, 0)], [0.04, 0.04, 0.035, 0.03], C["iron"], 5, caps=False)
    b.push((0.7, 2.62, 0))
    b.cyl((0, 0.18, 0), 0.2, 0.06, C["iron"], 0.14, 6)
    b.box((0, 0.0, 0), (0.3, 0.38, 0.3), C["glass"], 0.03, mat=1, ao=0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * 0.15, 0.0, sz * 0.15), (0.04, 0.4, 0.04), C["iron"], 0.01)
    b.cyl((0, 0.27, 0), 0.0, 0.2, C["iron"], 0.25, 6, ao=0.1)
    b.blob((0, 0.4, 0), 0.05, C["iron"], 1, 0.0)
    b.pop()
    return b.build()


@asset
def sign_bracket():
    b = Builder("sign_bracket", 2, ground_ao=False)
    b.box((0, 0, 0), (0.14, 0.14, 0.7), C["iron"], 0.03)
    b.box((0, -0.55, 0.55), (0.1, 0.1, 0.1), C["iron"], 0.02)
    b.box((0.0, -0.15, 0.6), (0.7, 0.04, 0.04), C["iron"], 0.01)
    b.box((0, -0.5, 0.6), (1.0, 0.9, 0.09), C["timber_l"], 0.04, segs=2)
    b.box((0, -0.5, 0.67), (0.84, 0.74, 0.03), C["cream"], 0.02)
    return b.build()


@asset
def crate():
    b = Builder("crate", 4)
    b.box((0, 0.3, 0), (0.62, 0.6, 0.62), C["timber_l"], 0.04, segs=2)
    for y in (0.08, 0.52):
        b.box((0, y, 0), (0.66, 0.08, 0.66), C["timber"], 0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * 0.3, 0.3, sz * 0.3), (0.08, 0.62, 0.08), C["timber"], 0.02)
    return b.build()


@asset
def barrel():
    b = Builder("barrel", 4)
    b.cyl((0, 0.45, 0), 0.38, 0.9, C["timber_l"], 0.3, 12, bev=0.16, ao=0.3)
    for y in (0.15, 0.75):
        b.cyl((0, y, 0), 0.36, 0.07, C["iron"], 0.36, 12)
    b.cyl((0, 0.45, 0), 0.4, 0.07, C["iron"], 0.4, 12)
    return b.build()


def banner(name, col):
    b = Builder(name, 2)
    b.cyl((0, 1.6, 0), 0.06, 3.2, C["timber"], 0.06, 8)
    b.blob((0, 3.25, 0), 0.1, C["gold"], 1)
    b.box((0, 2.9, 0), (0.7, 0.07, 0.07), C["timber"], 0.02)
    b.box((0, 2.2, 0.0), (0.62, 1.3, 0.04), col, 0.02, ao=0.3)
    b.prism([(-0.03, 1.6), (0.03, 1.6), (0.03, 1.4), (-0.03, 1.3)], 0.62, col, c=(0, 0, 0)) if False else None
    b.blob((0, 1.5, 0), (0.31, 0.12, 0.04), col, 1, 0.0, flat=True)
    b.blob((0, 2.2, 0.03), 0.14, C["gold"], 1, 0.0, flat=True, kbias=0.2)
    return b.build()


@asset
def banner_red():
    return banner("banner_red", C["flag_red"])


@asset
def banner_green():
    return banner("banner_green", C["flag_green"])


@asset
def well():
    b = Builder("well", 2)
    b.cyl((0, 0.45, 0), 0.9, 0.9, C["stone"], 0.9, 14, bev=0.08, ao=0.25)
    b.cyl((0, 0.93, 0), 0.74, 0.05, C["water"], 0.74, 14, ao=0.0)
    for sx in (-1, 1):
        b.box((sx * 0.8, 1.5, 0), (0.14, 1.5, 0.14), C["timber"], 0.03)
    b.box((0, 2.3, 0), (1.9, 0.12, 0.14), C["timber_d"], 0.03)
    b.push((0, 2.45, 0))
    b.box((0, 0, 0.0), (2.1, 0.08, 1.2), C["roof_a"], 0.03, rot=(0.0, 0, 0))
    b.pop()
    b.prism([(-0.7, 2.35), (0.7, 2.35), (0, 3.15)], 1.9, C["roof_a"], c=(0, 0, 0))
    b.cyl((0, 1.9, 0), 0.05, 0.9, C["timber_l"], 0.05, 6, axis="x") if False else None
    return b.build()


@asset
def fountain():
    b = Builder("fountain", 2)
    b.cyl((0, 0.3, 0), 2.1, 0.6, C["stone"], 2.0, 20, bev=0.08, ao=0.3)
    b.cyl((0, 0.5, 0), 1.7, 0.2, C["stone_l"], 1.7, 20, ao=0.1)
    b.cyl((0, 0.62, 0), 1.6, 0.06, C["water"], 1.6, 20, ao=0.0)
    b.cyl((0, 1.2, 0), 0.32, 1.4, C["stone"], 0.22, 10, bev=0.06, ao=0.35)
    b.cyl((0, 1.9, 0), 0.8, 0.2, C["stone_l"], 0.7, 14, bev=0.05)
    b.cyl((0, 2.05, 0), 0.62, 0.05, C["water"], 0.62, 14, ao=0.0)
    b.blob((0, 2.35, 0), (0.13, 0.2, 0.13), C["water"], 1, 0.05, kbias=0.3)
    return b.build()


# ====================================================================== MARKET STALL
def stall(name, accent, seed):
    b = Builder(name, seed)
    W, D = 3.0, 2.5
    # counter (front = +z)
    b.box((0, 0.5, 0.75), (W - 0.1, 1.0, 0.9), lin("#c99a62"), 0.05, segs=2, ao=0.2)
    b.box((0, 1.04, 0.78), (W + 0.06, 0.1, 1.0), C["timber_d"], 0.04, segs=2)
    for i in range(6):
        b.box((-1.2 + i * 0.48, 0.45, 1.215), (0.4, 0.8, 0.04), lin("#a9743f") if i % 2 else lin("#d9ad74"), 0.015)
    # back shelf + boards
    b.box((0, 1.1, -1.1), (W - 0.1, 2.2, 0.12), C["timber_d"], 0.04, ao=0.25)
    b.box((0, 1.0, -0.8), (W - 0.3, 0.1, 0.5), C["timber"], 0.03)
    b.box((0, 1.6, -0.8), (W - 0.3, 0.1, 0.5), C["timber"], 0.03)
    # posts
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * (W / 2 - 0.05), 1.3, sz * (D / 2 - 0.05) if sz < 0 else 1.15), (0.17, 2.6, 0.17), C["timber"], 0.04, segs=2)
    # awning: striped, slanting down to front
    n = 8
    sw = (W + 0.4) / n
    for i in range(n):
        col = accent if i % 2 == 0 else C["cream"]
        b.box((-W / 2 - 0.2 + sw * (i + 0.5), 2.78, 0.0), (sw - 0.01, 0.07, 2.9), col, 0.02, rot=(0.17, 0, 0), ao=0.1, top=0.1)
        b.blob((-W / 2 - 0.2 + sw * (i + 0.5), 2.45, 1.38), (sw * 0.5, 0.12, 0.08), col, 1, 0.05, flat=True, kbias=0.1)
    b.box((0, 2.95, -1.18), (W + 0.4, 0.2, 0.3), C["timber_d"], 0.03)
    # sign board above the front
    b.box((0, 2.2, 1.25), (1.5, 0.35, 0.06), C["timber_d"], 0.02)
    b.box((0, 2.2, 1.29), (1.34, 0.26, 0.03), C["cream"], 0.015)
    return b


@asset
def stall_terra():
    return stall("stall_terra", C["roof_a"], 1).build()


@asset
def stall_teal():
    return stall("stall_teal", C["teal"], 2).build()


@asset
def stall_mustard():
    return stall("stall_mustard", C["mustard"], 3).build()


@asset
def stall_pink():
    return stall("stall_pink", C["pink"], 4).build()


# ====================================================================== HOUSES
def window(b, w=0.8, h=1.0, shutter=C["teal"], box=False, flower=None, lit=True):
    b.box((0, 0, 0.03), (w + 0.2, h + 0.2, 0.1), C["timber_d"], 0.03, ao=0.1)
    b.box((0, 0, 0.09), (w, h, 0.03), C["glass"], 0.01, mat=1, ao=0.0)
    b.box((0, 0, 0.12), (0.05, h, 0.04), C["timber_d"], 0.01)
    b.box((0, 0.05, 0.12), (w, 0.05, 0.04), C["timber_d"], 0.01)
    for s in (-1, 1):
        b.box((s * (w / 2 + 0.28), 0, 0.07), (0.34, h + 0.1, 0.05), shutter, 0.02, ao=0.15)
        b.box((s * (w / 2 + 0.28), 0.0, 0.1), (0.24, 0.05, 0.02), C["timber_d"], 0.0)
    b.box((0, -h / 2 - 0.15, 0.12), (w + 0.5, 0.1, 0.26), C["stone_l"], 0.03)
    if box:
        b.box((0, -h / 2 - 0.33, 0.2), (w + 0.1, 0.22, 0.24), C["timber"], 0.03)
        for k in range(5):
            x = -w / 2 + 0.1 + k * (w - 0.2) / 4
            b.blob((x, -h / 2 - 0.15, 0.2), (0.12, 0.1, 0.1), C["leaf_mid"], 1, 0.2)
            b.blob((x + 0.02, -h / 2 - 0.05, 0.22), 0.06, C[flower or "f_pink"], 0, 0.0, flat=True, kbias=0.3)


def door(b, col=C["teal"]):
    w, h = 1.05, 1.95
    b.box((0, h / 2, 0.03), (w + 0.28, h + 0.14, 0.1), C["timber_d"], 0.03, ao=0.1)
    b.cyl((0, h, 0.03), (w + 0.28) / 2, 0.1, C["timber_d"], seg=14, axis="z", bev=0.0) if False else None
    b.box((0, h / 2, 0.09), (w, h, 0.05), col, 0.03, ao=0.2)
    b.cyl((0, h, 0.09), w / 2, 0.05, col, seg=14, axis="z", ao=0.1)
    for dx in (-0.25, 0.25):
        b.box((dx, h / 2 - 0.1, 0.125), (0.05, h - 0.5, 0.02), C["timber_d"], 0.0)
    b.blob((0.34, 0.95, 0.15), 0.06, C["gold"], 1, 0.0, kbias=0.3)
    b.box((0, 0.04, 0.45), (w + 0.6, 0.12, 0.8), C["stone_l"], 0.04)


def roof_gable(b, w, d, y0, H, o, ca, cb, overhang_x=0.4, n=8, tint=0.0):
    tanA = H / (d / 2)
    A = math.atan(tanA)
    ridge = Vector((0, y0 + H, 0))
    for s in (1, -1):
        eave = Vector((0, y0 - o * tanA, s * (d / 2 + o)))
        Ls = (eave - ridge).length
        cl = Ls / n * 1.3
        for i in range(n):
            f = (i + 0.5) / n
            p = ridge + (eave - ridge) * f
            nrm = Vector((0, math.cos(A), s * math.sin(A)))
            p = p + nrm * (i * 0.012 + 0.03)
            col = ca if (i + (0 if s == 1 else 1)) % 2 == 0 else cb
            col = mix(col, C["roof_c"], b.rng.uniform(0.0, 0.25))
            b.box(tuple(p), (w + overhang_x * 2, 0.09, cl), col, 0.02, rot=(s * A, 0, 0), ao=0.0, jit=0.06, top=0.12, gz=s)
    b.cyl((0, y0 + H + 0.06, 0), 0.13, w + overhang_x * 2 + 0.1, C["roof_c"], 0.13, 8, axis="x", bev=0.05)
    # gable infill
    b.prism([(-d / 2, y0), (d / 2, y0), (0, y0 + H)], w, C["plaster"], c=(0, 0, 0))


def house(name, w=5.2, d=4.4, floors=1, wall_h=2.55, plaster="plaster", timber="timber", roof=("roof_a", "roof_b"), shutter="teal",
          roof_h=2.5, jetty=0.0, chimney=True, awning=None, flower="f_pink", seed=1, stone="stone", door_slot=None, sign=False, tower_bay=False):
    b = Builder(name, seed)
    pl, tm = C[plaster], C[timber]
    base_h = 0.42
    b.box((0, base_h / 2, 0), (w + 0.18, base_h, d + 0.18), C[stone], 0.05, ao=0.3, segs=2)
    y = base_h
    ns = max(1, int(w // 2.2))
    dslot = (seed % (ns + 1)) if door_slot is None else door_slot
    for f in range(floors):
        dd = d + (jetty if f > 0 else 0)
        zc = (jetty / 2) if f > 0 else 0
        b.box((0, y + wall_h / 2, zc), (w, wall_h, dd), pl, 0.04, ao=0.12)
        b.box((0, y + 0.09, zc), (w + 0.14, 0.18, dd + 0.14), tm, 0.03)
        b.box((0, y + wall_h - 0.1, zc), (w + 0.14, 0.2, dd + 0.14), tm, 0.03)
        for sx in (-1, 1):
            for sz in (-1, 1):
                b.box((sx * w / 2, y + wall_h / 2, zc + sz * dd / 2), (0.2, wall_h, 0.2), tm, 0.04, ao=0.15)
        # front (z+) : posts between slots, door/windows
        slots = ns + (1 if f == 0 else 0)
        for i in range(1, slots):
            x = -w / 2 + w * i / slots
            b.box((x, y + wall_h / 2, zc + dd / 2 + 0.02), (0.14, wall_h - 0.3, 0.07), tm, 0.02)
        for i in range(slots):
            x = -w / 2 + w * (i + 0.5) / slots
            b.push((x, 0, zc + dd / 2))
            if f == 0 and i == dslot % slots:
                b.push((0, y, 0))
                door(b, C[shutter])
                b.pop()
            else:
                b.push((0, y + wall_h * 0.52, 0))
                window(b, 0.78, 0.98, C[shutter], box=(f == 0 and not awning), flower=flower)
                b.pop()
            b.pop()
        # diagonal braces on front between window rows (decorative)
        if floors > 1 and f < floors - 1:
            pass
        # sides
        for sx in (-1, 1):
            b.push((sx * w / 2, y + wall_h * 0.52, zc), sx * math.pi / 2)
            window(b, 0.7, 0.9, C[shutter], box=False)
            b.pop()
            pw = dd / 2 - 0.9
            for sg in (-1, 1):
                b.push((sx * w / 2, y + wall_h / 2, zc + sg * (dd / 4 + 0.45)), sx * math.pi / 2)
                L = math.hypot(pw * 0.8, wall_h - 0.5)
                b.box((0, 0, 0.03), (0.1, L, 0.06), tm, 0.02, rot=(0, 0, sg * math.atan2(pw * 0.8, wall_h - 0.5)))
                b.pop()
        y += wall_h
    # jetty brackets
    if jetty > 0:
        for i in range(3):
            x = -w / 2 + w * (i + 0.5) / 3
            b.box((x, base_h + wall_h - 0.2, d / 2 + 0.1), (0.14, 0.3, 0.3), tm, 0.02, rot=(0.7, 0, 0))
    dd = d + (jetty if floors > 1 else 0)
    roof_gable(b, w, dd, y, roof_h, 0.45, C[roof[0]], C[roof[1]])
    if chimney:
        b.box((w * 0.28, y + roof_h * 0.55, -dd * 0.12), (0.75, roof_h * 1.1, 0.75), C["stone"], 0.05, ao=0.3)
        b.box((w * 0.28, y + roof_h * 1.1 + 0.08, -dd * 0.12), (0.95, 0.16, 0.95), C["stone_d"], 0.04)
    if awning:
        n = 8
        for i in range(n):
            col = C[awning] if i % 2 == 0 else C["cream"]
            sw = (w * 0.9) / n
            b.box((-w * 0.45 + sw * (i + 0.5), base_h + 2.45, d / 2 + 0.7), (sw - 0.01, 0.07, 1.5), col, 0.02, rot=(0.35, 0, 0), ao=0.1, top=0.1)
        for sx in (-1, 1):
            b.box((sx * w * 0.44, base_h + 1.2, d / 2 + 1.35), (0.12, 2.4, 0.12), C["timber"], 0.03)
    if sign:
        b.push((w * 0.44, base_h + 3.1, d / 2 + 0.1))
        b.box((0, 0, 0), (0.14, 0.14, 0.9), C["iron"], 0.03)
        b.box((0, -0.55, 0.85), (0.1, 0.5, 0.1), C["iron"], 0.02) if False else None
        b.pop()
    return b.build()


@asset
def cottage_a():
    return house("cottage_a", 5.0, 4.2, 1, 2.5, roof_h=2.4, seed=2, flower="f_pink")


@asset
def cottage_b():
    return house("cottage_b", 5.6, 4.4, 1, 2.6, plaster="plaster_b", roof=("roof_c", "roof_a"), shutter="mustard", roof_h=2.6, seed=3, flower="f_yellow")


@asset
def cottage_c():
    return house("cottage_c", 4.6, 4.0, 1, 2.5, plaster="plaster_c", roof=("roof_blue", "roof_blue_b"), shutter="velvet", roof_h=2.3, seed=4, flower="f_white")


@asset
def house_two():
    return house("house_two", 5.8, 4.6, 2, 2.4, jetty=0.35, roof_h=2.7, seed=5, flower="f_purple")


@asset
def house_tall():
    return house("house_tall", 4.4, 4.2, 3, 2.35, plaster="plaster_b", roof=("roof_blue", "roof_blue_b"), shutter="velvet", jetty=0.3, roof_h=2.5, seed=6, door_slot=0)


@asset
def shop():
    return house("shop", 6.0, 4.6, 2, 2.5, plaster="plaster_c", roof=("roof_a", "roof_b"), shutter="teal", roof_h=2.6, awning="mustard", seed=7, sign=False, door_slot=1)


# ====================================================================== LANDMARKS
def round_tower(b, x, z, r, h, roof_col, roof_col_b, flag=None):
    b.cyl((x, h / 2, z), r, h, C["stone_l"], r * 0.97, 14, bev=0.0, ao=0.22)
    b.cyl((x, h + 0.15, z), r * 1.14, 0.3, C["stone"], r * 1.14, 14, bev=0.05)
    for k in range(10):
        a = k / 10 * math.tau
        b.box((x + math.cos(a) * r * 1.1, h + 0.5, z + math.sin(a) * r * 1.1), (0.4, 0.5, 0.4), C["stone"], 0.04, rot=(0, -a, 0))
    # conical roof
    n = 6
    for i in range(n):
        f0, f1 = i / n, (i + 1) / n
        ra, rb = r * 1.35 * (1 - f0) + 0.02, r * 1.35 * (1 - f1) + 0.02
        b.cyl((x, h + 0.55 + (f0 + f1) / 2 * r * 2.6, z), ra, r * 2.6 / n * 1.15, roof_col if i % 2 == 0 else roof_col_b, rb, 14, ao=0.0)
    b.cyl((x, h + 0.55 + r * 2.6 + 0.4, z), 0.04, 0.9, C["iron"], 0.04, 5)
    if flag:
        b.box((x + 0.35, h + 0.55 + r * 2.6 + 0.65, z), (0.7, 0.4, 0.04), flag, 0.01, ao=0.0)
    # windows
    for k in range(3):
        a = k * 2.1 + 0.4
        b.push((x + math.cos(a) * r * 0.97, h * 0.62, z + math.sin(a) * r * 0.97), -a + math.pi / 2)
        b.box((0, 0, 0.0), (0.5, 0.8, 0.14), C["timber_d"], 0.03)
        b.box((0, 0, 0.06), (0.36, 0.64, 0.06), C["glass"], 0.01, mat=1, ao=0.0)
        b.pop()


@asset
def tower():
    b = Builder("tower", 2)
    round_tower(b, 0, 0, 1.5, 7.0, C["roof_blue"], C["roof_blue_b"], C["flag_red"])
    return b.build()


@asset
def castle():
    b = Builder("castle", 2)
    # curtain wall + keep
    b.box((0, 2.2, 3.2), (14.0, 4.4, 1.3), C["stone_l"], 0.1, segs=2, ao=0.35)
    for k in range(18):
        b.box((-7 + k * 0.8 + 0.4, 4.7, 3.2), (0.46, 0.6, 1.3), C["stone"], 0.05)
    b.box((0, 3.0, 3.2), (3.4, 6.0, 1.7), C["stone"], 0.1, segs=2)
    # gate arch (dark)
    b.box((0, 1.6, 4.1), (2.2, 3.2, 0.15), C["timber_d"], 0.05)
    b.cyl((0, 3.2, 4.1), 1.1, 0.15, C["timber_d"], seg=14, axis="z")
    b.box((0, 1.5, 4.18), (1.6, 3.0, 0.05), C["timber"], 0.02)
    b.cyl((0, 3.0, 4.18), 0.8, 0.05, C["timber"], seg=14, axis="z")
    # keep
    b.box((0, 6.0, -1.0), (7.0, 12.0, 6.0), C["stone_l"], 0.12, segs=2, ao=0.4)
    for k in range(9):
        for sz in (-1, 1):
            b.box((-3.2 + k * 0.8, 12.5, -1.0 + sz * 2.8), (0.5, 0.7, 0.45), C["stone"], 0.05)
    # roof pyramid
    for i in range(6):
        f = i / 6
        s_ = 7.6 * (1 - f) + 0.2
        b.box((0, 12.2 + 0.4 + f * 5.2, -1.0), (s_, 0.5, s_ * 0.85), C["roof_blue"] if i % 2 == 0 else C["roof_blue_b"], 0.05, ao=0.0)
    b.cyl((0, 19, -1.0), 0.06, 2.0, C["iron"], 0.06, 5)
    b.box((0.55, 19.5, -1.0), (1.0, 0.6, 0.05), C["flag_red"], 0.01, ao=0.0)
    for k in range(3):
        for sy in (5.0, 8.5):
            b.push((-2.0 + k * 2.0, sy, 2.05))
            b.box((0, 0, 0), (0.8, 1.3, 0.2), C["timber_d"], 0.04)
            b.box((0, 0, 0.1), (0.6, 1.1, 0.06), C["glass"], 0.01, mat=1, ao=0.0)
            b.pop()
    round_tower(b, -7.0, 3.2, 1.7, 6.6, C["roof_a"], C["roof_b"], C["flag_red"])
    round_tower(b, 7.0, 3.2, 1.7, 6.6, C["roof_a"], C["roof_b"], C["flag_red"])
    round_tower(b, -5.0, -2.5, 1.4, 9.5, C["roof_blue"], C["roof_blue_b"])
    round_tower(b, 5.0, -2.5, 1.4, 9.5, C["roof_blue"], C["roof_blue_b"])
    return b.build()


@asset
def windmill():
    b = Builder("windmill", 2)
    b.cyl((0, 2.6, 0), 2.1, 5.2, C["plaster"], 1.45, 14, ao=0.22, bev=0.0)
    b.cyl((0, 0.35, 0), 2.3, 0.7, C["stone"], 2.25, 14, bev=0.05)
    for i in range(5):
        f0, f1 = i / 5, (i + 1) / 5
        b.cyl((0, 5.2 + 0.2 + (f0 + f1) / 2 * 2.6, 0), 1.75 * (1 - f0) + 0.05, 2.6 / 5 * 1.2, C["roof_a"] if i % 2 == 0 else C["roof_b"], 1.75 * (1 - f1) + 0.05, 14, ao=0.0)
    b.push((0, 0.55, 2.0))
    door(b, C["timber_l"])
    b.pop()
    b.push((0, 3.2, 1.7), 0.0)
    window(b, 0.6, 0.8, C["teal"])
    b.pop()
    b.cyl((0, 4.6, 1.75), 0.25, 0.7, C["timber_d"], 0.25, 8, axis="z")
    return b.build()


@asset
def windmill_blades():
    b = Builder("windmill_blades", 3, ground_ao=False)
    b.cyl((0, 0, 0.0), 0.3, 0.5, C["timber_d"], 0.24, 8, axis="z")
    L = 4.8
    for k in range(4):
        a = k * math.pi / 2
        dx, dy = round(math.cos(a)), round(math.sin(a))
        horiz = dx != 0
        b.box((dx * L / 2, dy * L / 2, 0.1), (L if horiz else 0.14, 0.14 if horiz else L, 0.14), C["timber"], 0.02)
        px, py = -dy, dx
        sl, sw = 3.4, 0.95
        cx, cy = dx * L * 0.58 + px * (sw / 2 + 0.07), dy * L * 0.58 + py * (sw / 2 + 0.07)
        b.box((cx, cy, 0.12), (sl if horiz else sw, sw if horiz else sl, 0.05), C["cream"], 0.02, ao=0.1)
    return b.build()


@asset
def gate_towers():
    b = Builder("gate_towers", 2)
    # arch gate between two round towers, opening ~ 5.6 wide along x, facing +z
    round_tower(b, -4.2, 0, 1.7, 6.5, C["roof_a"], C["roof_b"], C["flag_red"])
    round_tower(b, 4.2, 0, 1.7, 6.5, C["roof_a"], C["roof_b"], C["flag_red"])
    b.box((-2.6, 2.6, 0), (1.4, 5.2, 1.8), C["stone_l"], 0.1, segs=2, ao=0.35)
    b.box((2.6, 2.6, 0), (1.4, 5.2, 1.8), C["stone_l"], 0.1, segs=2, ao=0.35)
    b.box((0, 5.0, 0), (4.0, 1.4, 1.8), C["stone_l"], 0.1, segs=2, ao=0.1)
    for k in range(11):
        b.box((-3.9 + k * 0.78, 6.0, 0.0), (0.45, 0.55, 1.8), C["stone"], 0.05)
    for sx in (-1, 1):
        b.box((sx * 2.2, 2.6, 0.0), (0.5, 5.2, 1.9), C["stone"], 0.06, ao=0.2) if False else None
    b.push((0, 5.0, 0.95))
    b.box((0, 0, 0), (1.6, 1.0, 0.12), C["cream"], 0.04)
    b.box((0, 0, 0.07), (1.3, 0.75, 0.04), C["timber_d"], 0.02)
    b.pop()
    # lantern lights beside gate
    for sx in (-1, 1):
        b.box((sx * 1.9, 3.2, 1.0), (0.3, 0.4, 0.3), C["glass"], 0.03, mat=1, ao=0.0)
        b.box((sx * 1.9, 3.5, 1.0), (0.36, 0.06, 0.36), C["iron"], 0.01)
    return b.build()


# ====================================================================== COURT
@asset
def court_wall():
    b = Builder("court_wall", 2, ground_ao=True)
    rng = b.rng
    W, H = 20.0, 9.0
    ax, ay, aw, ah = 0.6, 1.2, 7.6, 4.4
    stones = [lin(h) for h in ("#c7c3d2", "#d6d1dc", "#b9b5c8", "#cfc6c9", "#bfbdd0")]
    mortar = lin("#8c88a0")
    cream = lin("#efe3c6")

    def in_arch(x, z):
        if abs(x - ax) > aw / 2 + 0.05:
            return False
        if z < ay - 0.05:
            return False
        if z < ay + ah:
            return True
        r = aw / 2
        return (x - ax) ** 2 + (z - (ay + ah)) ** 2 < r * r
    # mortar backing as strips: avoid window by building rows
    row_h = 0.7
    z = 0.0
    row = 0
    while z < H:
        x = -W / 2 - (0.7 if row % 2 else 0)
        while x < W / 2:
            bw = rng.uniform(1.2, 1.7)
            cx, cz = x + bw / 2, z + row_h / 2
            corners = [(cx + dx, cz + dz) for dx in (-bw / 2, bw / 2) for dz in (-row_h / 2, row_h / 2)]
            inside = [in_arch(px, pz) for px, pz in corners]
            if not any(inside) and abs(cx) < W / 2 + 0.4:
                depth = rng.uniform(0.28, 0.4)
                col = rng.choice(stones)
                b.box((cx, cz, 0.0 - depth / 2 + 0.2), (bw - 0.07, row_h - 0.07, depth), col, 0.06, segs=2, ao=0.3, jit=0.05)
            x += bw
        z += row_h
        row += 1
    # dark backing so gaps read as mortar
    b.box((-(W / 2 + ax - aw / 2 - 0.6) / 2 - (aw / 2 - ax) * 0 + 0, H / 2, -0.12), (1, 1, 1), mortar, 0.0) if False else None
    left_w = (ax - aw / 2) - (-W / 2)
    right_w = W / 2 - (ax + aw / 2)
    b.box((-W / 2 + left_w / 2, H / 2, -0.1), (left_w + 0.2, H, 0.1), mortar, 0.0, ao=0.0)
    b.box((W / 2 - right_w / 2, H / 2, -0.1), (right_w + 0.2, H, 0.1), mortar, 0.0, ao=0.0)
    b.box((ax, ay / 2, -0.1), (aw + 0.4, ay, 0.1), mortar, 0.0, ao=0.0)
    b.box((ax, ay + ah + aw / 4 + 0.6, -0.1), (aw + 0.4, aw / 2 + 2.4 + 0.2, 0.1), mortar, 0.0, ao=0.0) if False else None
    # arch frame in cream stone
    for i in range(17):
        a = math.pi * i / 16
        r = aw / 2 + 0.3
        px, pz = ax + math.cos(a) * r, ay + ah + math.sin(a) * r
        b.box((px, pz, 0.13), (0.7, 0.55, 0.6), cream if i != 8 else C["gold"], 0.07, rot=(0, 0, a - math.pi / 2 + 0), segs=2, ao=0.25)
    for s in (-1, 1):
        for k in range(8):
            b.box((ax + s * (aw / 2 + 0.3), ay + k * 0.55 + 0.27, 0.12), (0.7, 0.55, 0.6), cream, 0.07, segs=2, ao=0.25)
    b.box((ax, ay - 0.2, 0.3), (aw + 1.6, 0.4, 1.1), cream, 0.08, segs=2, ao=0.2)
    # wainscot base band
    b.box((0, 0.5, 0.35), (W, 1.0, 0.25), lin("#a9a3bb"), 0.06, ao=0.3) if False else None
    return b.build()


@asset
def pillar():
    b = Builder("pillar", 2)
    cream, cream_l = C["stone_l"], lin("#efe3c6")
    b.cyl((0, 0.3, 0), 0.9, 0.6, cream, 0.8, 14, bev=0.06, ao=0.3)
    b.cyl((0, 4.0, 0), 0.52, 7.0, cream_l, 0.46, 16, ao=0.2)
    for k in range(8):
        a = k / 8 * math.tau
        b.cyl((math.cos(a) * 0.52, 4.0, math.sin(a) * 0.52), 0.07, 6.9, cream, 0.07, 6, ao=0.2) if False else None
    b.cyl((0, 7.7, 0), 0.8, 0.5, cream, 0.62, 14, bev=0.05)
    b.box((0, 8.1, 0), (1.6, 0.35, 1.6), cream, 0.06, segs=2)
    b.cyl((0, 7.4, 0), 0.6, 0.2, C["gold"], 0.6, 14, bev=0.04)
    return b.build()


@asset
def banner_hang():
    b = Builder("banner_hang", 2, ground_ao=False)
    b.box((0, 3.0, 0), (1.5, 0.12, 0.12), C["gold_d"], 0.03)
    b.blob((-0.78, 3.0, 0), 0.1, C["gold"], 1)
    b.blob((0.78, 3.0, 0), 0.1, C["gold"], 1)
    b.box((0, 1.7, 0.0), (1.2, 2.6, 0.05), C["purple"], 0.02, ao=0.35)
    b.prism([(-0.03, 0.4), (0.03, 0.4), (0.03, 0.05), (-0.03, 0.05)], 1.2, C["purple"], c=(0, 0, 0)) if False else None
    b.box((0, 1.7, 0.035), (0.9, 2.3, 0.02), lin("#9068c8"), 0.0, ao=0.2)
    b.blob((0, 2.15, 0.06), (0.3, 0.3, 0.05), C["gold"], 1, 0.05, flat=True, kbias=0.2)
    b.blob((0, 1.2, 0.06), (0.18, 0.4, 0.05), C["gold"], 1, 0.05, flat=True, kbias=0.15)
    for i in range(3):
        b.blob((-0.4 + i * 0.4, 0.38, 0.0), (0.2, 0.2, 0.06), C["purple"], 1, 0.0, flat=True, rot=(0, 0, 0.78))
    return b.build()


@asset
def sconce():
    b = Builder("sconce", 2, ground_ao=False)
    b.box((0, 0, 0), (0.3, 0.5, 0.1), C["iron"], 0.03)
    b.tube([(0, -0.1, 0.05), (0, -0.15, 0.4), (0, 0.0, 0.55)], [0.05, 0.05, 0.05], C["iron"], 6, caps=False)
    b.cyl((0, 0.05, 0.55), 0.17, 0.12, C["iron"], 0.12, 8, bev=0.03)
    b.blob((0, 0.3, 0.55), (0.14, 0.26, 0.14), C["glass"], 1, 0.1, mat=1, kbias=0.5)
    return b.build()


@asset
def perch():
    b = Builder("perch", 2)
    b.cyl((0, 0.08, 0), 0.5, 0.16, C["timber_d"], 0.42, 14, bev=0.04, ao=0.2)
    b.cyl((0, 0.95, 0), 0.14, 1.7, C["timber_l"], 0.1, 10, ao=0.3)
    b.cyl((0, 1.9, 0), 0.07, 1.0, C["gold"], 0.07, 8, axis="x", ao=0.1)
    for sx in (-1, 1):
        b.blob((sx * 0.5, 1.9, 0), 0.1, C["gold_d"], 1)
    b.blob((0, 1.65, 0), (0.2, 0.1, 0.2), C["gold"], 1)
    return b.build()


@asset
def throne():
    """Throne + stone stairs, unit scale same as old throne.glb (scene scales x2.5). Front = +z, seat back at -z."""
    b = Builder("throne", 2)
    for i in range(4):
        h = 0.14
        d = 1.5 - i * 0.28
        w = 1.9 - i * 0.12
        zc = -(0.05 + i * 0.14)
        b.box((0, h / 2 + i * h, zc), (w, h, d), lin("#e7dcc6") if i % 2 == 0 else lin("#d7c9ae"), 0.022, segs=2, ao=0.2)
    top = 4 * 0.14
    for i in range(4):  # carpet runner
        d = 1.5 - i * 0.28
        b.box((0, (i + 1) * 0.14 + 0.005, -(0.05 + i * 0.14) + 0.0), (0.7, 0.012, d + 0.02), C["velvet"], 0.004, ao=0.0)
    b.box((0, top + 0.15, -0.42), (0.8, 0.3, 0.62), C["gold"], 0.04, segs=2)
    b.box((0, top + 0.34, -0.4), (0.7, 0.12, 0.54), C["velvet"], 0.05, segs=2, ao=0.1, top=0.1)
    b.box((0, top + 0.62, -0.72), (0.86, 0.72, 0.14), C["gold"], 0.05, segs=2)
    b.box((0, top + 0.6, -0.64), (0.62, 0.5, 0.07), C["velvet"], 0.05, segs=2, ao=0.2)
    b.cyl((0, top + 0.98, -0.72), 0.43, 0.14, C["gold"], 0.43, 24, axis="z", bev=0.04)
    b.cyl((0, top + 0.98, -0.64), 0.32, 0.06, C["velvet"], 0.32, 20, axis="z")
    b.blob((0, top + 1.0, -0.62), (0.09, 0.12, 0.06), lin("#3aa0ff"), 1, 0.05, kbias=0.3)
    for s in (-1, 1):
        b.box((s * 0.43, top + 0.5, -0.4), (0.14, 0.12, 0.62), C["gold"], 0.04, segs=2)
        b.blob((s * 0.43, top + 0.55, -0.1), 0.085, C["gold_d"], 1)
        b.cyl((s * 0.43, top + 0.25, -0.4), 0.05, 0.36, C["gold_d"], 0.05, 10)
        b.blob((s * 0.4, top + 1.0, -0.72), (0.08, 0.13, 0.08), C["gold"], 1, 0.0)
    return b.build()



# ====================================================================== ROUND 3: to-scale, simple court
def poly_prism_bm(t, pts, z0, z1):
    """extrude a 2D polygon (x,y) between z0 and z1 into bmesh t (three-space)."""
    lo = [t.verts.new((x, y, z0)) for x, y in pts]
    hi = [t.verts.new((x, y, z1)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        t.faces.new((lo[i], lo[j], hi[j], hi[i]))
    t.faces.new(lo[::-1])
    t.faces.new(hi)
    bmesh.ops.recalc_face_normals(t, faces=t.faces[:])


def pointed_window(cx, y0, w, y1):
    """outline of a gothic (equilateral pointed) window: rect y0..y1 + pointed arch on top."""
    pts = [(cx - w / 2, y0), (cx - w / 2, y1)]
    n = 10
    for k in range(1, n + 1):  # left arc: centre (cx+w/2, y1), r=w, theta 180 -> 120 deg
        th = math.pi - (math.pi / 3) * k / n
        pts.append((cx + w / 2 + w * math.cos(th), y1 + w * math.sin(th)))
    for k in range(n - 1, 0, -1):  # mirror
        th = math.pi - (math.pi / 3) * k / n
        pts.append((cx - w / 2 - w * math.cos(th), y1 + w * math.sin(th)))
    pts += [(cx + w / 2, y1), (cx + w / 2, y0)]
    return pts


def holed_slab(b, x0, x1, y0, y1, z0, z1, holes, col):
    """flat slab with prism holes (Boolean difference) appended into the builder (vertex-coloured)."""
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.transform(t, matrix=Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)), verts=t.verts[:])
    bmesh.ops.transform(t, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), verts=t.verts[:])
    me = bpy.data.meshes.new("slab")
    t.to_mesh(me)
    t.free()
    ob = bpy.data.objects.new("slab", me)
    bpy.context.scene.collection.objects.link(ob)
    cuts = []
    for k, pts in enumerate(holes):
        tc = bmesh.new()
        poly_prism_bm(tc, pts, z0 - 1, z1 + 1)
        mc = bpy.data.meshes.new("cut")
        tc.to_mesh(mc)
        tc.free()
        oc = bpy.data.objects.new("cut", mc)
        bpy.context.scene.collection.objects.link(oc)
        cuts.append(oc)
        md = ob.modifiers.new("b%d" % k, "BOOLEAN")
        md.object = oc
        md.operation = "DIFFERENCE"
        md.solver = "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    eo = ob.evaluated_get(dg)
    em = eo.to_mesh()
    tt, tl = b._tmp()
    vm = [tt.verts.new(v.co) for v in em.vertices]
    for v in vm:
        v[tl] = (*shade(col, 0.5 + 0.3 * clamp(v.co.y / 8.0) - 0.15), 1.0)
    for poly in em.polygons:
        try:
            tt.faces.new([vm[i] for i in poly.vertices])
        except ValueError:
            pass
    eo.to_mesh_clear()
    for o in [ob] + cuts:
        bpy.data.objects.remove(o, do_unlink=True)
    b._commit(tt, tl, 0, False)


def _wall():
    """Warm brick back wall, 3 tall pointed windows, cream trim. Front face at z=0 (bricks protrude to ~0.1). x -16..16, y 0..10."""
    b = Builder("court_wall", 4)
    bt = Builder("court_trim", 5)
    rng = b.rng
    X0, X1, H = -16.0, 16.0, 10.0
    wins = [(-0.4, 1.55), (6.2, 1.55), (12.8, 1.55)]
    WW, WH = 2.2, 2.4  # width, straight height
    holes = [pointed_window(cx, y0, WW, y0 + WH) for cx, y0 in wins]
    holed_slab(b, X0, X1, 0.0, H, -0.5, 0.0, holes, lin("#ffffff"))  # bricks = painted canvas texture in the app (uv = x,y / 4 m)
    bricks = [lin(h) for h in ("#c9a48a", "#c19a80", "#cdaa90", "#bb9278")]

    def inside(x, y, m=0.0):
        for cx, y0 in wins:
            y1 = y0 + WH
            if y < y0 - m:
                continue
            if abs(x - cx) > WW / 2 + m:
                continue
            if y <= y1:
                return True
            if x <= cx and math.hypot(x - (cx + WW / 2), y - y1) < WW + m:
                return True
            if x > cx and math.hypot(x - (cx - WW / 2), y - y1) < WW + m:
                return True
        return False
    cream = lin("#f4e8cc")
    for cx, y0 in wins:
        y1 = y0 + WH
        for sx in (-1, 1):
            for k in range(int(WH / 0.6) + 1):
                bt.box((cx + sx * (WW / 2 + 0.17), y0 + 0.3 + k * 0.6, 0.12), (0.36, 0.56, 0.3), cream, 0.04, segs=1, ao=0.2)
            n = 6
            for k in range(n):
                th = math.pi - (math.pi / 3) * (k + 0.5) / n
                rr = WW + 0.17
                ax = (cx + WW / 2 + rr * math.cos(th)) if sx < 0 else (cx - WW / 2 - rr * math.cos(th))
                ay = y1 + rr * math.sin(th)
                rot = th if sx < 0 else math.pi - th
                bt.box((ax, ay, 0.12), (0.36, 0.5, 0.3), cream, 0.04, rot=(0, 0, rot), ao=0.2)
        bt.box((cx, y1 + WW * 0.866 + 0.2, 0.14), (0.5, 0.5, 0.32), lin("#f4d98a"), 0.06, rot=(0, 0, math.pi / 4), ao=0.2)
        bt.box((cx, y0 - 0.1, 0.25), (WW + 0.9, 0.22, 0.6), cream, 0.05, segs=1, ao=0.25)
    bt.box((0, 0.22, 0.12), (X1 - X0, 0.44, 0.22), lin("#a88c80"), 0.03, ao=0.3)  # skirting
    wood_d, wood_l = lin("#7a5036"), lin("#93633f")
    bt.box((0, 0.95, 0.16), (X1 - X0, 1.0, 0.16), wood_d, 0.02, ao=0.25)                     # timber dado panelling
    for k in range(int((X1 - X0) / 1.1)):
        bt.box((X0 + 0.55 + k * 1.1, 0.95, 0.26), (0.92, 0.82, 0.05), wood_l, 0.03, segs=1, ao=0.2)
    bt.box((0, 1.52, 0.22), (X1 - X0, 0.12, 0.3), lin("#5f3d28"), 0.03, ao=0.2)              # dado rail
    bt.box((0, 7.5, 0.3), (X1 - X0, 0.5, 0.65), lin("#6e472d"), 0.04, ao=0.3)                # ceiling beam / cornice
    bt.box((0, 7.1, 0.16), (X1 - X0, 0.18, 0.3), lin("#c9b08e"), 0.03, ao=0.25)              # stone trim band under it
    for k in range(int((X1 - X0) / 4.0)):
        bt.box((X0 + 2.0 + k * 4.0, 7.2, 0.45), (0.3, 0.5, 0.5), lin("#6e472d"), 0.03, ao=0.2)  # beam brackets
    return b, bt


@asset
def court_wall():
    return _wall()[0].build()


@asset
def court_trim():
    return _wall()[1].build()


@asset
def throne_dais():
    """Side-view throne on 5 limestone steps with a plum/gold runner. Unit scale = metres. Origin: floor under the seat centre.
    Chair faces +x; steps descend toward +x (foot at x=3.9). Platform z -1.4..1.9 (front = +z, toward camera)."""
    b = Builder("throne_dais", 3)
    lime = [lin("#e8dec9"), lin("#ddd1b8")]
    plum, gold_l = lin("#5b2a52"), lin("#f0c14a")
    rise, tread = 0.34, 0.62
    ZA, ZB = -1.4, 1.9
    zc, zd = (ZA + ZB) / 2, ZB - ZA
    X_BACK, X_PLAT = -2.6, 1.4
    # dais mouldings: plinth, mid band, cornice cap and carved panels so the platform reads as built stone, not a box
    stone_d, stone_l = lin("#cbbd9f"), lin("#efe5cd")
    b.box(((X_BACK + X_PLAT) / 2 - 0.05, 0.16, ZB + 0.06), (X_PLAT - X_BACK + 0.1, 0.32, 0.12), stone_d, 0.03, segs=1, ao=0.3)
    b.box(((X_BACK + X_PLAT) / 2, 0.92, ZB + 0.025), (X_PLAT - X_BACK + 0.04, 0.1, 0.07), stone_l, 0.02, ao=0.2)
    b.box(((X_BACK + X_PLAT) / 2 - 0.05, 1.66, ZB + 0.08), (X_PLAT - X_BACK + 0.12, 0.16, 0.16), stone_l, 0.03, segs=1, ao=0.25)
    for px in (X_BACK + 0.62, X_BACK + 1.55, X_BACK + 2.5):
        b.box((px, 1.3, ZB + 0.02), (0.78, 0.48, 0.05), stone_d, 0.03, ao=0.3)
        b.box((px, 0.58, ZB + 0.02), (0.78, 0.4, 0.05), stone_d, 0.03, ao=0.3)
    prof = [(X_BACK, 0.0), (X_BACK, 1.7), (X_PLAT, 1.7)]
    for j in range(1, 5):
        prof += [(X_PLAT + tread * (j - 1), rise * (5 - j)), (X_PLAT + tread * j, rise * (5 - j))]
    prof += [(X_PLAT + tread * 4, 0.0)]
    # polygon is in (x,y); extrude along z
    t_, tl_ = b._tmp()
    poly_prism_bm(t_, prof, ZA, ZB)
    for v in t_.verts:
        v[tl_] = (*shade(lime[0], 0.35 + 0.5 * clamp(v.co.y / 1.9)), 1.0)
    b._commit(t_, tl_, 0, False)
    # plum runner over every tread + rise, plus a plum/gold outline on the visible side face
    prev_x, prev_y = X_PLAT, 1.7
    b.box((X_BACK + (X_PLAT - X_BACK) / 2, 1.708, zc), (X_PLAT - X_BACK + 0.02, 0.03, zd + 0.02), plum, 0.01, ao=0.0)
    for j in range(1, 5):
        h = rise * (5 - j)
        x0, x1 = X_PLAT + tread * (j - 1), X_PLAT + tread * j
        b.box(((x0 + x1) / 2, h + 0.008, zc), (tread + 0.02, 0.03, zd + 0.02), plum, 0.01, ao=0.0)
        b.box((x0 - 0.005, h + rise / 2, zc), (0.03, rise + 0.02, zd + 0.02), plum, 0.01, ao=0.0)
        b.box(((x0 + x1) / 2, h + 0.012, ZB + 0.012), (tread + 0.03, 0.06, 0.03), gold_l, 0.0, ao=0.0)
    b.box((X_PLAT - 0.005, 1.7 - rise / 2, zc), (0.03, rise + 0.02, zd + 0.02), plum, 0.01, ao=0.0)
    return b.build()


@asset
def throne_chair():
    """Chair only, origin at the seat centre (x=0, z=0), y absolute (dais top = 1.7). Thin low near arm so the sitter reads."""
    b = Builder("throne_chair", 3)
    plum = lin("#5b2a52")
    cx = 0.0
    b.box((cx, 1.95, 0.0), (1.3, 0.5, 1.4), C["gold"], 0.06, segs=2, ao=0.25)
    b.box((cx, 2.24, 0.0), (1.16, 0.14, 1.26), plum, 0.06, segs=2, ao=0.1, top=0.12)
    b.box((cx - 0.62, 3.05, 0.0), (0.3, 2.2, 1.5), C["gold"], 0.07, rot=(0, 0, 0.07), segs=2, ao=0.2)
    b.blob((cx - 0.7, 4.25, 0.0), (0.32, 0.3, 0.8), C["gold"], 1, 0.05, kbias=0.2)
    b.box((cx - 0.15, 2.95, -0.78), (1.3, 1.5, 0.16), C["gold"], 0.06, segs=2, ao=0.2)
    b.cyl((cx - 0.15, 3.7, -0.78), 0.65, 0.16, C["gold"], 0.65, 20, axis="z", bev=0.03)
    b.box((cx - 0.12, 2.9, -0.69), (1.0, 1.2, 0.05), plum, 0.02, ao=0.15)
    b.cyl((cx - 0.12, 3.5, -0.69), 0.5, 0.05, plum, 0.5, 18, axis="z")
    b.box((cx + 0.05, 2.38, 0.72), (0.9, 0.1, 0.1), C["gold"], 0.03, segs=1)
    b.blob((cx - 0.55, 4.33, -0.72), 0.16, C["gold"], 1, 0.0, kbias=0.25)
    b.blob((cx - 0.55, 4.33, 0.72), 0.16, C["gold"], 1, 0.0, kbias=0.25)
    # carved detail: stud rows, cushion piping + tassels, rosettes on the wing, scroll feet
    for k in range(9):
        b.blob((cx - 0.5, 2.3 + k * 0.22, 0.745), 0.045, lin("#fff0b0"), 1, 0.0, kbias=0.3)
        b.blob((cx - 0.5, 2.3 + k * 0.22, -0.745), 0.045, lin("#fff0b0"), 1, 0.0, kbias=0.3)
    b.box((cx, 2.17, 0.64), (1.2, 0.05, 0.05), lin("#f6cf5a"), 0.01, ao=0.0)
    b.box((cx + 0.58, 2.2, 0.0), (0.05, 0.05, 1.3), lin("#f6cf5a"), 0.01, ao=0.0)
    for sz in (-0.62, 0.62):
        b.cyl((cx + 0.62, 2.0, sz), 0.04, 0.3, lin("#f6cf5a"), 0.03, 6, ao=0.0)
        b.blob((cx + 0.62, 1.82, sz), 0.07, lin("#f6cf5a"), 1, 0.0, kbias=0.3)
    for ry, rr_ in ((3.1, 0.2), (3.6, 0.14)):
        b.cyl((cx - 0.15, ry, -0.69), rr_, 0.03, lin("#f6cf5a"), rr_, 14, axis="z", ao=0.0)
        b.cyl((cx - 0.15, ry, -0.66), rr_ * 0.55, 0.03, lin("#c68a22"), rr_ * 0.55, 10, axis="z", ao=0.0)
    for sz in (-0.5, 0.5):
        b.blob((cx - 0.86, 2.2, sz), (0.14, 0.2, 0.1), C["gold"], 1, 0.0, kbias=0.2)
    return b.build()




def coin_disc(b, c, n, r):
    """Flat coin: thin disc (~1:8), raised ring rim, embossed crown on the face. Flat-shaded so it never reads as a ball."""
    c = Vector(c)
    n = Vector(n).normalized()
    up = Vector((0, 1, 0)) if abs(n.y) < 0.9 else Vector((1, 0, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    b.tube([tuple(c - n * 0.03), tuple(c + n * 0.03)], [r, r], lin("#f0b52c"), 14, None, ao=0.05, caps=True, smooth=False)
    b.tube([tuple(c + n * 0.029), tuple(c + n * 0.036)], [r * 0.8, r * 0.8], lin("#ffd763"), 14, None, ao=0.0, caps=True, smooth=False)
    ring = [tuple(c + n * 0.036 + u * (math.cos(a_) * r * 0.92) + v * (math.sin(a_) * r * 0.92)) for a_ in [k / 14 * math.tau for k in range(15)]]
    b.tube(ring, [0.026] * len(ring), lin("#ffe08a"), 4, None, ao=0.0, caps=False, smooth=True)
    crown = [(-.5, -.34), (-.5, .26), (-.25, -.02), (0, .42), (.25, -.02), (.5, .26), (.5, -.34), (-.5, -.34)]
    pts = [tuple(c + n * 0.045 + u * (x * r * 0.7) + v * (y * r * 0.7)) for x, y in crown]
    b.tube(pts, [0.02] * len(pts), lin("#fff0b0"), 4, None, ao=0.0, caps=False)


def coin_stack(b, base, count, r, rng):
    for k in range(count):
        o = Vector((rng.uniform(-0.03, 0.03), 0.034 + k * 0.066, rng.uniform(-0.03, 0.03)))
        coin_disc(b, Vector(base) + o, (rng.uniform(-0.02, 0.02), 1, rng.uniform(-0.02, 0.02)), r)


def mound(name, R, ncoins, nspill, seed):
    b = Builder(name, seed)
    rng = b.rng
    b.blob((0, 0.0, 0), (R * 1.0, R * 0.74, R * 0.92), lin("#d19a2c"), 3, 0.03, kbias=0.05)
    cam = Vector((0, 0.2, 1)).normalized()
    placed = 0
    guard = 0
    while placed < ncoins and guard < ncoins * 40:
        guard += 1
        th = rng.uniform(0, math.tau)
        uu = rng.uniform(0.02, 1.0)
        d = Vector((math.cos(th) * math.sqrt(1 - uu * uu), uu, math.sin(th) * math.sqrt(1 - uu * uu)))
        if d.z < -0.2:
            continue
        pos = Vector((d.x * R, d.y * R * 0.74, d.z * R * 0.92)) * 1.015
        ns = Vector((d.x / R, d.y / (R * 0.74), d.z / (R * 0.92))).normalized()
        n = (ns * 0.55 + cam * 0.45 + Vector((rng.uniform(-.28, .28), rng.uniform(-.28, .28), rng.uniform(-.12, .12)))).normalized()
        coin_disc(b, pos + ns * 0.03, n, 0.30 * rng.uniform(0.92, 1.08))
        placed += 1
    # a couple of neat stacks on the floor + spilled flat coins + coins leaning on the mound
    coin_stack(b, (R * 1.25, 0, R * 0.55), 6, 0.3, rng)
    coin_stack(b, (R * 1.5, 0, R * 0.9), 4, 0.3, rng)
    if R > 1.3:
        coin_stack(b, (-R * 1.15, 0, R * 0.95), 5, 0.3, rng)
    for k in range(nspill):
        a = rng.uniform(-0.2, math.pi + 0.2)
        dist = R * rng.uniform(1.05, 1.7)
        pos = Vector((math.cos(a) * dist + R * 0.2, 0.034, abs(math.sin(a)) * dist * 0.9 + 0.5))
        if k % 5 == 0:   # on edge, leaning against the mound
            ang = rng.uniform(-0.5, 0.5)
            pos = Vector((math.sin(ang) * R * 0.95, 0.27, R * 0.92 * math.cos(ang) + 0.12))
            n = Vector((math.sin(ang) * 0.5, 0.45, 0.85)).normalized()
        else:            # lying flat
            n = Vector((rng.uniform(-.04, .04), 1, rng.uniform(-.04, .04))).normalized()
        coin_disc(b, pos, n, 0.30 * rng.uniform(0.92, 1.05))
    return b.build()


@asset
def coin_mound_s():
    return mound("coin_mound_s", 1.0, 34, 6, 1)


@asset
def coin_mound_m():
    return mound("coin_mound_m", 1.5, 72, 10, 2)


@asset
def coin_mound_l():
    return mound("coin_mound_l", 2.1, 135, 16, 3)


# ------------------------------------------------------------------ run
for nm, fn in ASSETS.items():
    if ONLY and nm not in ONLY:
        continue
    ob = fn()
    ob.name = nm
    export(ob)
print("ENV_STATS", STATS)
print("TOTAL_TRIS", sum(v[0] for v in STATS.values()))

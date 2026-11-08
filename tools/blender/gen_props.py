"""
Royal Concerns custom props - chunky Clash-of-Clans-style mid-poly models.
Run in BACKGROUND Blender (never in a user's open file):
  blender -b --factory-startup -P tools/blender/gen_props.py -- E:/RoyalConcerns/game/public/models
or via Blender MCP `execute_blender_code_for_cli` with exec(open(...).read()) and OUT set.
Exports: owl.glb, throne.glb, coin.glb, coinpile_s/m/l.glb, crown.glb, basket.glb, backdrop.glb
Conventions: 1 unit = Kenney character height ~0.8; models face -Y in Blender (= +Z in glTF/three).
Owl has separate named nodes (body, head, wing_l, wing_r) so three.js can animate them procedurally.
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector

OUT = globals().get("OUT")
if not OUT:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    OUT = argv[0] if argv else os.path.join(os.getcwd(), "public", "models")
os.makedirs(OUT, exist_ok=True)
random.seed(4)

def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)

MATS = {}
def mat(name, rgb, rough=0.7, metal=0.0, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    MATS[name] = m
    return m

def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

GOLD = lambda: mat("Gold", srgb("#f2b627"), 0.35, 0.6)
GOLD_D = lambda: mat("GoldDark", srgb("#c47f12"), 0.4, 0.5)
RED = lambda: mat("Velvet", srgb("#c8323a"), 0.85)
RED_D = lambda: mat("VelvetDark", srgb("#8f1f2a"), 0.9)
GEM_B = lambda: mat("GemBlue", srgb("#3aa0ff"), 0.15, 0.0, 0.3)
GEM_G = lambda: mat("GemGreen", srgb("#34d17a"), 0.15, 0.0, 0.3)

def finish(o, m, bevel=0.0, segs=2, smooth=True):
    if m: o.data.materials.append(m)
    if bevel:
        bv = o.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = segs; bv.limit_method = "ANGLE"
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o

def cube(name, size, loc, m=None, bevel=0.02, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel, 2, smooth=False) if bevel else finish(o, m, 0, 0, False)

def sphere(name, r, loc, m=None, scale=(1, 1, 1), segs=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m)

def cyl(name, r, depth, loc, m=None, verts=16, rot=(0, 0, 0), bevel=0.01, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=verts, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, vertices=verts, rotation=rot)
    o = bpy.context.active_object; o.name = name
    finish(o, m, bevel, 2, smooth=True)
    return o

def torus(name, R, r, loc, m=None, rot=(0, 0, 0), maj=24, mn=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=maj, minor_segments=mn)
    o = bpy.context.active_object; o.name = name
    return finish(o, m)

def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception: pass
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    return o

def set_origin(o, pt):
    cur = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = pt
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = cur

def export(name):
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_materials="EXPORT", export_animations=False)
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print("EXPORTED", name, "faces", tris)
    return tris

report = {}

# ============================================================ OWL (Sage Ollie)
reset()
FEATH = mat("OwlFeather", srgb("#8a5a3a"), 0.9)
FEATH_D = mat("OwlFeatherDark", srgb("#6b4128"), 0.9)
BELLY = mat("OwlBelly", srgb("#f1d9a8"), 0.9)
ROBE = mat("Robe", srgb("#7b4fc9"), 0.8)
ROBE_T = GOLD()
EYEW = mat("EyeWhite", srgb("#ffffff"), 0.3)
EYEB = mat("EyeBlack", srgb("#1a1410"), 0.2)
BEAK = mat("Beak", srgb("#f39a1e"), 0.5)

body_parts = [
    sphere("b1", 0.27, (0, 0, 0.30), FEATH, (1, 0.9, 1.15), 20, 12),
    sphere("belly", 0.2, (0, -0.12, 0.27), BELLY, (1, 0.6, 1.1), 16, 10),
    cyl("robe", 0.30, 0.30, (0, 0, 0.15), ROBE, 20, r2=0.24, bevel=0.03),
    torus("trim", 0.30, 0.025, (0, 0, 0.01), ROBE_T, maj=24, mn=6),
    sphere("foot_l", 0.06, (-0.09, -0.2, 0.02), BEAK, (1, 1.4, 0.6)),
    sphere("foot_r", 0.06, (0.09, -0.2, 0.02), BEAK, (1, 1.4, 0.6)),
]
body = join(body_parts, "body")
set_origin(body, (0, 0, 0))

hy = 0.66
head_parts = [
    sphere("h", 0.24, (0, 0, hy), FEATH, (1.1, 0.95, 0.95), 20, 12),
    sphere("face", 0.19, (0, -0.1, hy - 0.01), BELLY, (1.25, 0.55, 0.9), 16, 10),
    sphere("eye_l", 0.075, (-0.085, -0.19, hy + 0.02), EYEW),
    sphere("eye_r", 0.075, (0.085, -0.19, hy + 0.02), EYEW),
    sphere("pupil_l", 0.042, (-0.085, -0.25, hy + 0.02), EYEB),
    sphere("pupil_r", 0.042, (0.085, -0.25, hy + 0.02), EYEB),
    sphere("glint_l", 0.013, (-0.072, -0.285, hy + 0.04), EYEW, segs=8, rings=6),
    sphere("glint_r", 0.013, (0.098, -0.285, hy + 0.04), EYEW, segs=8, rings=6),
    cyl("beak", 0.045, 0.1, (0, -0.25, hy - 0.07), BEAK, 8, rot=(math.radians(100), 0, 0), r2=0.0),
    torus("spec_l", 0.085, 0.012, (-0.085, -0.27, hy + 0.02), GOLD(), rot=(math.radians(90), 0, 0), maj=16, mn=5),
    torus("spec_r", 0.085, 0.012, (0.085, -0.27, hy + 0.02), GOLD(), rot=(math.radians(90), 0, 0), maj=16, mn=5),
    cube("bridge", (0.03, 0.015, 0.015), (0, -0.28, hy + 0.04), GOLD(), 0),
    cyl("tuft_l", 0.06, 0.16, (-0.16, 0, hy + 0.19), FEATH_D, 8, rot=(0, math.radians(-25), 0), r2=0.0),
    cyl("tuft_r", 0.06, 0.16, (0.16, 0, hy + 0.19), FEATH_D, 8, rot=(0, math.radians(25), 0), r2=0.0),
    # wizard hat
    cyl("hat_brim", 0.24, 0.03, (0, 0.02, hy + 0.2), ROBE, 20, bevel=0.01),
    cyl("hat_cone", 0.15, 0.32, (0.02, 0.03, hy + 0.37), ROBE, 16, rot=(0, math.radians(-12), 0), r2=0.02),
    torus("hat_band", 0.135, 0.018, (0, 0.02, hy + 0.24), GOLD(), maj=20, mn=5),
    sphere("hat_star", 0.035, (0.07, 0.03, hy + 0.52), GOLD(), segs=8, rings=6),
]
head = join(head_parts, "head")
set_origin(head, (0, 0, 0.5))

for side, nm in ((-1, "wing_l"), (1, "wing_r")):
    w = sphere(nm, 0.17, (side * 0.27, 0.02, 0.33), FEATH_D, (0.45, 0.9, 1.3), 14, 8)
    set_origin(w, (side * 0.22, 0.02, 0.48))
report["owl"] = export("owl")

# ============================================================ THRONE + golden stairs
reset()
parts = []
# stairs (3 steps) + platform, going down toward -Y and +X (visitor side)
for i in range(4):
    h = 0.14
    d = 1.5 - i * 0.28
    parts.append(cube(f"step{i}", (1.9 - i * 0.12, d, h), (0, 0.05 + i * 0.14, h / 2 + i * h), GOLD() if i % 2 == 0 else GOLD_D(), 0.025))
top = 4 * 0.14
# red carpet down the stairs
for i in range(4):
    parts.append(cube(f"carpet{i}", (0.7, 1.5 - i * 0.28 + 0.02, 0.012), (0, 0.05 + i * 0.14, (i + 1) * 0.14 + 0.006), RED(), 0))
# seat
parts.append(cube("seat_base", (0.8, 0.62, 0.3), (0, 0.42, top + 0.15), GOLD(), 0.04))
parts.append(cube("cushion", (0.68, 0.52, 0.1), (0, 0.4, top + 0.33), RED(), 0.045))
# back
parts.append(cube("back", (0.86, 0.14, 1.1), (0, 0.72, top + 0.85), GOLD(), 0.05))
parts.append(cube("back_pad", (0.62, 0.06, 0.8), (0, 0.64, top + 0.8), RED(), 0.04))
parts.append(cyl("back_round", 0.43, 0.14, (0, 0.72, top + 1.4), GOLD(), 24, rot=(math.radians(90), 0, 0), bevel=0.04))
parts.append(sphere("crest_gem", 0.09, (0, 0.63, top + 1.42), GEM_B(), (1, 0.6, 1.2)))
# arms
for s in (-1, 1):
    parts.append(cube(f"arm{s}", (0.14, 0.62, 0.12), (s * 0.43, 0.42, top + 0.5), GOLD(), 0.04))
    parts.append(sphere(f"knob{s}", 0.085, (s * 0.43, 0.12, top + 0.55), GOLD_D()))
    parts.append(cyl(f"leg{s}", 0.05, 0.36, (s * 0.43, 0.15, top + 0.25), GOLD_D(), 10))
    parts.append(sphere(f"gem{s}", 0.05, (s * 0.43, 0.07, top + 0.57), GEM_G()))
    parts.append(sphere(f"finial{s}", 0.08, (s * 0.38, 0.72, top + 1.45), GOLD(), (1, 1, 1.3)))
throne = join(parts, "throne")
report["throne"] = export("throne")

# ============================================================ COIN + PILES
def coin(name, loc=(0, 0, 0), rot=(0, 0, 0)):
    c = cyl(name, 0.09, 0.025, loc, GOLD(), 18, rot=rot, bevel=0.008)
    return c

reset()
c = coin("coin", rot=(math.radians(90), 0, 0))
inner = cyl("coin_star", 0.055, 0.03, (0, 0, 0), GOLD_D(), 5, rot=(math.radians(90), 0, 0), bevel=0)
join([c, inner], "coin")
report["coin"] = export("coin")

def pile(name, n, radius, height):
    reset()
    objs = []
    # mound base
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=(0, 0, 0), segments=18, ring_count=9)
    m = bpy.context.active_object; m.scale = (1, 1, height / radius); bpy.ops.object.transform_apply(scale=True)
    finish(m, GOLD_D())
    bm = bmesh.new(); bm.from_mesh(m.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context="VERTS")
    bm.to_mesh(m.data); bm.free()
    objs.append(m)
    for i in range(n):
        a = random.random() * math.tau
        rr = radius * math.sqrt(random.random()) * 0.95
        x, y = math.cos(a) * rr, math.sin(a) * rr
        z = height * max(0.0, 1 - (rr / radius) ** 2) ** 0.5
        objs.append(coin(f"c{i}", (x, y, z + 0.005), (random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), random.random() * 3)))
    join(objs, name)
    return export(name)

report["coinpile_s"] = pile("coinpile_s", 18, 0.35, 0.12)
report["coinpile_m"] = pile("coinpile_m", 45, 0.6, 0.25)
report["coinpile_l"] = pile("coinpile_l", 90, 0.9, 0.42)

# ============================================================ CROWN
reset()
parts = [cyl("band", 0.13, 0.08, (0, 0, 0.04), GOLD(), 20, bevel=0.01)]
parts.append(cyl("velvet", 0.115, 0.1, (0, 0, 0.07), RED(), 16, bevel=0.02, r2=0.06))
for i in range(5):
    a = i / 5 * math.tau
    x, y = math.cos(a) * 0.125, math.sin(a) * 0.125
    parts.append(cyl(f"pt{i}", 0.035, 0.1, (x, y, 0.12), GOLD(), 6, r2=0.0))
    parts.append(sphere(f"ball{i}", 0.018, (x, y, 0.175), GOLD(), segs=8, rings=6))
    parts.append(sphere(f"gem{i}", 0.02, (math.cos(a) * 0.132, math.sin(a) * 0.132, 0.045), GEM_B() if i % 2 else RED_D(), segs=8, rings=6))
join(parts, "crown")
report["crown"] = export("crown")

# ============================================================ BASKET (market viewmodel)
reset()
WICKER = mat("Wicker", srgb("#c48a3c"), 0.9)
WICKER_D = mat("WickerDark", srgb("#8f5e22"), 0.9)
b = cyl("bowl", 0.36, 0.26, (0, 0, 0.13), WICKER, 24, r2=0.44, bevel=0.0)
bm = bmesh.new(); bm.from_mesh(b.data)
top_faces = [f for f in bm.faces if f.normal.z > 0.9]
bmesh.ops.delete(bm, geom=top_faces, context="FACES")
bm.to_mesh(b.data); bm.free()
sol = b.modifiers.new("solid", "SOLIDIFY"); sol.thickness = 0.03
parts = [b]
for i in range(4):
    parts.append(torus(f"ring{i}", 0.37 + i * 0.022, 0.016, (0, 0, 0.04 + i * 0.065), WICKER_D, maj=28, mn=6))
parts.append(torus("rim", 0.445, 0.03, (0, 0, 0.26), WICKER_D, maj=28, mn=8))
h = torus("handle", 0.42, 0.028, (0, 0, 0.26), WICKER_D, rot=(math.radians(90), 0, 0), maj=28, mn=6)
bm = bmesh.new(); bm.from_mesh(h.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.02], context="VERTS")  # local: keep upper arc
bm.to_mesh(h.data); bm.free()
parts.append(h)
join(parts, "basket")
report["basket"] = export("basket")

# ============================================================ THRONE ROOM BACKDROP (stone wall with arch window)
reset()
STONES = [mat(f"Stone{i}", srgb(c), 0.95) for i, c in enumerate(["#d2b98f", "#c2a57c", "#dcc7a0", "#b3966f", "#e6d3ad"])]
MORTAR = mat("Mortar", srgb("#7d654c"), 1.0)
W, H = 18.0, 8.0
ax, ay, aw, ah = 0.6, 1.2, 7.6, 4.4  # arch centre-x, sill height, width, straight height
def in_arch(x, z):
    if abs(x - ax) > aw / 2: return False
    if z < ay: return False
    if z < ay + ah: return True
    r = aw / 2
    return (x - ax) ** 2 + (z - (ay + ah)) ** 2 < r * r
parts = [cube("mortar", (W, 0.3, H), (0, 0.22, H / 2), MORTAR, 0)]
# cut the window hole out of the mortar backing with a boolean
cutter = cube("cut", (aw, 1, ah), (ax, 0.2, ay + ah / 2), None, 0)
bpy.ops.mesh.primitive_cylinder_add(radius=aw / 2, depth=1, location=(ax, 0.2, ay + ah), rotation=(math.radians(90), 0, 0), vertices=48)
cut2 = bpy.context.active_object
for cu in (cutter, cut2):
    bo = parts[0].modifiers.new("bool", "BOOLEAN"); bo.object = cu; bo.operation = "DIFFERENCE"
bpy.context.view_layer.objects.active = parts[0]
for md in list(parts[0].modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
bpy.data.objects.remove(cutter, do_unlink=True); bpy.data.objects.remove(cut2, do_unlink=True)
row_h = 0.55
z = 0.0
row = 0
while z < H:
    x = -W / 2 - (0.4 if row % 2 else 0)
    while x < W / 2:
        bw = random.uniform(0.8, 1.3)
        cx, cz = x + bw / 2, z + row_h / 2
        corners = [(cx + dx, cz + dz) for dx in (-bw / 2 + 0.05, bw / 2 - 0.05) for dz in (-row_h / 2 + 0.05, row_h / 2 - 0.05)]
        if not any(in_arch(px, pz) for px, pz in corners) and abs(cx) < W / 2 + 0.3:
            depth = random.uniform(0.28, 0.38)
            parts.append(cube(f"st{len(parts)}", (bw - 0.07, depth, row_h - 0.07), (cx, 0.12 - depth / 2 + 0.15, cz), random.choice(STONES), 0.06))
        x += bw
    z += row_h
    row += 1
# arch keystones ring
for i in range(15):
    a = math.pi * i / 14
    r = aw / 2 + 0.28
    px, pz = ax + math.cos(a) * r, ay + ah + math.sin(a) * r
    parts.append(cube(f"arch{i}", (0.62, 0.5, 0.42), (px, -0.05, pz), STONES[2] if i != 7 else GOLD(), 0.06, rot=(0, -(a - math.pi / 2), 0)))
for s in (-1, 1):
    for k in range(8):
        parts.append(cube(f"jamb{s}{k}", (0.6, 0.5, 0.55), (ax + s * (aw / 2 + 0.28), -0.05, ay + k * 0.55 + 0.27), STONES[2], 0.06))
parts.append(cube("sill", (aw + 1.2, 0.8, 0.3), (ax, -0.1, ay - 0.15), STONES[4], 0.07))
join(parts, "backdrop")
report["backdrop"] = export("backdrop")

result = {"out": OUT, "faces": report}
print("RESULT", result)

#!/usr/bin/env python3
"""
Blender 5.3 AAA Stylized 3D Asset Pipeline for Bizarro Melee.
Builds smooth-shaded, beveled, multi-part PBR .glb asset libraries into web/assets/models/:
  1. characters.glb   — Sculpted 3D character headgears, snouts, torsos, armor, boots, gloves,
                        wings, shells, tails, capes, Master Mitt (5-finger quilted glove),
                        and Sagging Bag!
  2. weapons.glb      — Detailed 3D fighter weapons & signature props (Yardstick Rapier,
                        Flaming Broomstick, Pipe Wrench, Trash-Can Lid Shield, Grill Spatula,
                        Duct-Tape Arm Cannon, Judge Hammer, Cast-Iron Frying Pan, Snow Shovel,
                        Window Squeegee, Baseball Bat, Giant Pill, Monocle, Astro Crystal).
  3. items.glb        — Sculpted 3D meshes for all 24 Bizarro Melee items and 8 Critter Summons.
  4. stage-props.glb  — Dramatic multi-part 3D architectural stage centerpieces (12 themes).
Run: blender --background --python scripts/build-blender-assets.py
"""
import math
import os
import bpy
import bmesh
from contextlib import contextmanager
from pathlib import Path
from mathutils import Matrix, Vector

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web", "assets", "models"))
os.makedirs(OUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, rgba, metallic=0.1, roughness=0.42, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_part(kind, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), mat=None, smooth=True, **kwargs):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot, scale=scale)
    elif kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=kwargs.get("seg", 18), ring_count=kwargs.get("rings", 12), location=loc, rotation=rot, scale=scale)
    elif kind == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=kwargs.get("sub", 2), location=loc, rotation=rot, scale=scale)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=kwargs.get("verts", 16), location=loc, rotation=rot, scale=scale)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=kwargs.get("verts", 16), location=loc, rotation=rot, scale=scale)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(
            major_segments=kwargs.get("mseg", 20), minor_segments=kwargs.get("nseg", 10),
            major_radius=kwargs.get("maj", 1.0), minor_radius=kwargs.get("min", 0.22),
            location=loc, rotation=rot
        )
        bpy.context.active_object.scale = scale
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    if kwargs.get("bevel"):
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = kwargs["bevel"]
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    return obj


def join_parts(parts, final_name):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = final_name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def paint_pickups():
    # Bake a warm overhead wash and cooler undersides once. A shared byte color
    # attribute keeps the pickup readable while it spins under different stages' lights.
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        low = min(v.co.z for v in mesh.vertices)
        span = max(v.co.z for v in mesh.vertices) - low
        colors = mesh.color_attributes.new(name="Paint",type="BYTE_COLOR",domain="POINT")
        for v,entry in zip(mesh.vertices,colors.data):
            t = (v.co.z-low)/max(span,.001)
            light = .67+.23*t+.10*max(0,v.normal.z)
            entry.color = (light,light*(.92+.08*t),light*(1-.09*t),1)
        mesh.color_attributes.active_color = colors


def export_glb(filename):
    if filename == "items.glb":
        paint_pickups()
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE" if filename == "items.glb" else "MATERIAL",
        export_apply=True,
    )
    print(f"Exported {path} ({os.path.getsize(path)} bytes)")


# Source art is optional at build time. Every exported piece is a static, local mesh.
PACKS = Path(os.environ.get("BIZARRO_ART_PACKS", "/tmp/bizarro-itch-assets"))
BASE = PACKS / "quaternius" / "Universal Base Characters[Standard]"
KAY = PACKS / "kaykit" / "KayKit_Adventurers_2.0_FREE"
NATURE = PACKS / "nature" / "glTF"
FRONT = Matrix.Rotation(math.pi / 2, 4, "Z")  # Blender -Y to the rig's +X


@contextmanager
def source_meshes(path):
    if not path.is_file():
        yield []
        return
    # Some Universal Base exports reference *_png.png while the supplied maps
    # end in .png. Bind the real packed pixels to the authored paths in memory.
    if path.name.startswith("Superhero_"):
        for map_name in ("T_Hair_1_Normal", "T_Eye_Normal"):
            alias = path.parent / (map_name+"_png.png")
            actual = path.parent / (map_name+".png")
            if actual.is_file() and not alias.exists() and not any(im.filepath == str(alias) for im in bpy.data.images):
                image = bpy.data.images.load(str(actual))
                image.pack()
                image.filepath = str(alias)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=False)
    imported = set(bpy.data.objects) - before
    try:
        yield sorted((o for o in imported if o.type == "MESH" and o.name != "Icosphere"), key=lambda o: o.name)
    finally:
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)


def mesh_object(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


def polish(obj, ratio=1, subdiv=0):
    bpy.context.view_layer.objects.active = obj
    if subdiv:
        mod = obj.modifiers.new("Sculpt smoothing", "SUBSURF")
        mod.levels = subdiv
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if ratio < 1:
        mod = obj.modifiers.new("Game resolution", "DECIMATE")
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def fit(obj, size=(2, 2, 2), center=(0, 0, 0)):
    verts = obj.data.vertices
    lo = Vector([min(v.co[i] for v in verts) for i in range(3)])
    hi = Vector([max(v.co[i] for v in verts) for i in range(3)])
    mid = (lo + hi) * .5
    for v in verts:
        v.co = [center[i] + (v.co[i] - mid[i]) * size[i] / max(hi[i] - lo[i], .00001) for i in range(3)]
    obj.data.update()
    return obj


def garment_uv(obj):
    # The painter places the chest crest at U=.25 and the hem at V=0.
    mesh = obj.data
    uv = mesh.uv_layers.new(name="Garment")
    zs = [v.co.z for v in mesh.vertices]
    bottom, height = min(zs), max(zs) - min(zs)
    for face in mesh.polygons:
        points = [mesh.vertices[mesh.loops[i].vertex_index].co for i in face.loop_indices]
        us = [(.25 + math.atan2(p.y, p.x) / math.tau) % 1 for p in points]
        seam = max(us) - min(us) > .5
        for i, u, pt in zip(face.loop_indices, us, points):
            uv.data[i].uv = (u + (seam and u < .5), (pt.z - bottom) / height)


def loft(name, rings, mat, flute=0):
    # Each control ring defines height, fore-aft depth, breadth, and forward offset.
    n = 32 if flute else 16
    verts = []
    for z, depth, width, offset in rings:
        for i in range(n):
            a = i * math.tau / n
            fold = 1 + flute * math.cos(a * 8) * (1 - z) / 2
            verts.append((offset + depth * fold * math.cos(a), width * fold * math.sin(a), z))
    faces = [(j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i)
             for j in range(len(rings)-1) for i in range(n)]
    faces += [tuple(reversed(range(n))), tuple(range(len(verts)-n, len(verts)))]
    obj = polish(mesh_object(name, verts, faces, mat), subdiv=2)
    garment_uv(obj)
    return obj


def sweep(name, sections, mat):
    """Rounded cross sections following a curved profile in the X/Z plane."""
    verts, faces = [], []
    sides = 12
    for j,(x,y,z,width,thick) in enumerate(sections):
        a,b = sections[max(0,j-1)],sections[min(j+1,len(sections)-1)]
        dx,dz = b[0]-a[0], b[2]-a[2]
        length = max(.0001, math.hypot(dx,dz))
        for i in range(sides):
            angle = math.tau*i/sides
            normal = thick*math.sin(angle)/length
            verts.append((x-dz*normal, y+width*math.cos(angle), z+dx*normal))
            if j:
                k = (j-1)*sides
                faces.append((k+i,k+(i+1)%sides,k+sides+(i+1)%sides,k+sides+i))
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts)-sides,len(verts)))])
    return polish(mesh_object(name,verts,faces,mat),subdiv=2)


def source_part(path, name, mat, size=(2, 2, 2), center=(0, 0, 0), select=None, rotation=FRONT, upper=None):
    with source_meshes(path) as sources:
        if not sources:
            return None
        src = next(o for o in sources if select is None or select(o.name))
        mesh = src.data.copy()
        # glTF splits painted panels along UV islands and hard normals. Collapse
        # those duplicate vertices before decimation or the plates tear apart.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
        if upper is not None:
            zs = [v.co.z for v in bm.verts]
            cut = min(zs) + (max(zs)-min(zs))*upper
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                                   plane_co=(0,0,cut), plane_no=(0,0,1), clear_inner=True)
            bmesh.ops.holes_fill(bm, edges=[ed for ed in bm.edges if ed.is_boundary], sides=0)
        bm.to_mesh(mesh)
        bm.free()
        mesh.transform(rotation @ src.matrix_world)
        mesh.materials.clear()
        mesh.materials.append(mat)
        for face in mesh.polygons:
            face.material_index = 0
        if src.name == name:
            src.name = "Imported_" + name
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        print("Source:", path.stem, src.name, "->", name)
        return fit(polish(obj, .52), size, center)


def kay_prop(asset, name, mat, size, center=(0,0,0), rotation=FRONT):
    return source_part(KAY/"Assets/gltf"/(asset+".gltf"),name,mat,size,center,rotation=rotation)


def anatomy(source, name, bones, mat, arm=False):
    # Partition polygons by their combined skin weights, in the unposed bind mesh.
    weights = [sum(g.weight for g in v.groups if source.vertex_groups[g.group].name.lower() in bones)
               for v in source.data.vertices]
    faces = [tuple(p.vertices) for p in source.data.polygons
             if sum(weights[i] for i in p.vertices) / len(p.vertices) >= .5]
    if not faces:
        raise ValueError(f"No weighted faces for {name} in {source.name}")
    used = sorted({i for face in faces for i in face})
    remap = {v: i for i, v in enumerate(used)}
    rot = FRONT @ Matrix.Rotation(math.pi / 2 if arm else 0, 4, "Y") @ source.matrix_world
    obj = mesh_object(name, [rot @ source.data.vertices[i].co for i in used],
                      [[remap[i] for i in face] for face in faces], mat)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00003)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.to_mesh(obj.data)
    bm.free()
    if len(obj.data.polygons) < 120:
        polish(obj, subdiv=1)
    else:
        polish(obj, min(.52, 500 / max(1, len(obj.data.polygons))))
    fit(obj)
    garment_uv(obj)
    print("Source:", source.name, "->", name, len(obj.data.polygons), "faces")


def build_sculpts(mat, white, brown, pink, dark):
    hero = [(-1,.56,.65,0),(-.84,.8,.82,0),(-.3,.68,.78,-.05),(.36,.94,.98,.04),(.73,.91,1,.05),(1,.44,.49,0)]
    limb = [(-1,.44,.46,.03),(-.86,.57,.62,.04),(-.16,.83,.76,-.08),(.35,.99,.96,-.08),(.78,.90,.89,.05),(1,.54,.62,.03)]
    skull = [(-1,.3,.38,.2),(-.83,.69,.66,.14),(-.4,.94,.87,.07),(.02,1,.98,0),(.48,.94,1,-.04),(.81,.75,.76,-.06),(1,.34,.35,-.05)]
    for gender, suffix in [("Male","Male"), ("Female","Fem")]:
        parts = [("Head_Hero"+suffix, {"head"}, skull), ("Body_HeroTorso"+("" if gender=="Male" else "Fem"),
                 {"spine_01","spine_02","spine_03","clavicle_l","clavicle_r"}, hero)]
        if gender == "Male":
            parts += [("Limb_"+n, {b+"_l"}, limb) for n,b in [("UpperArm","upperarm"),("Forearm","lowerarm"),("Thigh","thigh"),("Shin","calf")]]
        path = BASE / "Base Characters/Godot - UE" / f"Superhero_{gender}_FullBody.gltf"
        with source_meshes(path) as meshes:
            for name, groups, profile in parts:
                if meshes:
                    anatomy(max(meshes, key=lambda o: len(o.data.vertices)), name, groups, mat, name in ("Limb_UpperArm","Limb_Forearm"))
                else:
                    fit(loft(name, profile, mat))
    stout = [(-1,.58,.58,0),(-.75,.98,.9,.08),(-.12,1.05,1,.15),(.55,.93,.97,.05),(.86,.74,.83,0),(1,.47,.47,0)]
    skirt = [(-1,1.28,1.38,-.03),(-.92,1.34,1.4,-.04),(-.67,1.22,1.32,-.03),(-.51,1.22,1.27,0),(.05,.66,.68,0),(.28,.52,.58,0),(.66,.78,.78,.06),(1,.39,.47,0)]
    loft("Body_StoutTorso", stout, mat)
    loft("Body_DressSkirt", skirt, mat, .24)
    coat = loft("Coat", stout, mat)
    cuffs = [add_part("sphere", "Wool", loc=(.77*math.cos(i*math.tau/16),.77*math.sin(i*math.tau/16),-.78),
                      scale=(.27,.27,.14),mat=white) for i in range(16)]
    join_parts([coat]+cuffs,"Body_ParkaTorso")
    for kay, part, target, fallback in [
        ("Knight","Body","Body_ArmorTorso",hero), ("Barbarian","Body","Body_BruteTorso",hero),
        ("Ranger","Body","Body_RangerTunic",stout), ("Mage","Cape","Part_RoyalMantle",skirt),
        ("Rogue_Hooded","Mask","Part_NinjaMask",skull)]:
        obj = source_part(KAY/"Characters/gltf"/(kay+".glb"),target,mat,select=lambda n:n.endswith("_"+part))
        if obj:
            garment_uv(obj)
            obj.data.uv_layers.active_index = len(obj.data.uv_layers)-1
            for layer in list(obj.data.uv_layers)[:-1]:
                obj.data.uv_layers.remove(layer)
        else:
            loft(target,fallback,mat)
    plate = source_part(KAY/"Characters/gltf/Knight.glb","Part_KnightPauldron",mat,
                        select=lambda n:n.endswith("_ArmLeft"),upper=.61)
    if not plate:
        loft("Part_KnightPauldron",stout,mat)
    for hair in ["Hair_SimpleParted","Hair_Buns","Hair_Long","Hair_Beard"]:
        src = BASE/"Hairstyles/Origin at 0/glTF (Godot)"/(hair+".gltf")
        strands = source_part(src,hair,mat)
        if hair == "Hair_Beard":
            backing = sweep("Beard volume",[(.18,0,.60,.54,.24),(.42,0,.23,.87,.37),
                           (.20,0,-.42,.70,.43),(.02,0,-.98,.09,.05)],mat)
        else:
            backing = add_part("sphere","Hair volume",(-.10,0,.31),scale=(.94,.99,.69),mat=mat)
        parts = [backing]
        if strands:
            strands.name = "Source strands"
            parts.append(strands)
        if hair in ("Hair_SimpleParted","Hair_Buns","Hair_Long"):
            for s in [-1,1]:
                parts.append(sweep("Fringe",[(.32,s*.05,.76,.31,.20),(.72,s*.21,.62,.31,.22),
                    (.90,s*.46,.25,.24,.18),(.67,s*.76,-.04,.19,.15),(.43,s*.90,-.46,.024,.04)],mat))
        join_parts(parts,hair)
    dragon = PACKS/"monsters/Blend/Dragon.blend"
    if dragon.is_file():
        with bpy.data.libraries.load(str(dragon)) as (_, data):
            data.objects = ["Dragon"]
        anatomy(data.objects[0], "Head_TurtleSculpt", {"head","face","nose"}, mat)
        bpy.data.objects.remove(data.objects[0], do_unlink=True)
    for kind, chin, cheek, brow in [
        ("ToonRound",.82,1.05,1),("FoxSculpt",.51,1.16,.91),("ToucanSculpt",.55,.82,1.07),
        ("GorillaSculpt",.98,1.04,1.13),("TurtleSculpt",1.03,.96,1.06),("DinoSculpt",.74,.94,.91),
        ("CatSculpt",.56,1.15,1.04),("MouseSculpt",.64,1.12,1.01)]:
        if kind == "TurtleSculpt" and dragon.is_file():
            continue
        rings = [(z,d*(brow if z>0 else 1),w*(chin if z<-.45 else cheek if z<.25 else 1),dx) for z,d,w,dx in skull]
        parts = [loft(kind,rings,mat)]
        if kind in ("GorillaSculpt","MouseSculpt","CatSculpt","FoxSculpt"):
            for side in [-1,1]:
                parts.append(add_part("sphere","Cheek",loc=(.55,.63*side,-.29),rot=(side*.23,0,0),
                    scale=(.39,.45,.30),mat=pink if kind=="MouseSculpt" else mat))
        if kind=="GorillaSculpt":
            parts.append(add_part("sphere","Muzzle",loc=(.76,0,-.47),scale=(.5,.78,.39),mat=brown))
            for side in [-1,1]:
                parts.append(add_part("sphere","Brow",loc=(.76,.48*side,.34),rot=(side*.26,0,0),scale=(.24,.56,.15),mat=mat))
        join_parts(parts,"Head_"+kind)


def build_characters_pack():
    """Sculpted high-detail modular character accessories, snouts, hats, armor, limbs, and boss rigs."""
    clear_scene()
    m_neutral = make_mat("NeutralTint", (0.95, 0.95, 0.98, 1), roughness=0.4)
    m_dark = make_mat("CharDark", (0.10, 0.12, 0.18, 1), metallic=0.25, roughness=0.35)
    m_gold = make_mat("CharGold", (1.0, 0.80, 0.18, 1), metallic=0.82, roughness=0.2)
    m_chrome = make_mat("CharChrome", (0.85, 0.88, 0.94, 1), metallic=0.9, roughness=0.16)
    m_cyan = make_mat("CharCyan", (0.20, 0.94, 1.0, 1), metallic=0.2, roughness=0.15, emission=(0.20, 0.94, 1.0, 1), emission_strength=1.4)
    m_red = make_mat("CharRed", (0.94, 0.22, 0.30, 1), roughness=0.38)
    m_orange = make_mat("CharOrange", (1.0, 0.50, 0.12, 1), roughness=0.35)
    m_green = make_mat("CharGreen", (0.18, 0.82, 0.34, 1), roughness=0.4)
    m_white = make_mat("CharWhite", (0.96, 0.97, 1.0, 1), roughness=0.45)
    m_brown = make_mat("CharBrown", (0.24, 0.14, 0.08, 1), roughness=0.55)
    m_burlap = make_mat("Burlap", (0.82, 0.72, 0.56, 1), roughness=0.85)
    m_cream = make_mat("CharCream", (0.98, 0.94, 0.84, 1), roughness=0.48)
    m_teal = make_mat("CharTeal", (0.12, 0.74, 0.82, 1), metallic=0.42, roughness=0.22)
    m_blue = make_mat("CharBlue", (0.18, 0.36, 0.92, 1), roughness=0.38)
    m_amber = make_mat("CharAmber", (0.72, 0.36, 0.12, 1), roughness=0.46)
    m_pink = make_mat("CharPink", (1.0, 0.45, 0.72, 1), roughness=0.4)
    m_lime = make_mat("CharLime", (0.62, 0.98, 0.22, 1), roughness=0.36)
    m_copper = make_mat("CharCopper", (0.72, 0.38, 0.18, 1), metallic=0.74, roughness=0.28)

    # 1. Sculpted Boot (cuffed hero boot with sole & toe cap)
    join_parts([
        add_part("sphere", "bt1", loc=(0.22, 0, -0.1), scale=(0.48, 0.34, 0.26), mat=m_neutral),
        add_part("cyl", "bt2", loc=(-0.05, 0, 0.22), scale=(0.28, 0.28, 0.32), mat=m_neutral),
        add_part("torus", "bt3", loc=(-0.05, 0, 0.45), scale=(0.29, 0.29, 0.22), mat=m_gold),
        sweep("Stacked sole",[(-.39,0,-.24,.18,.055),(-.31,0,-.26,.30,.085),(.12,0,-.29,.35,.075),
              (.51,0,-.27,.32,.069),(.70,0,-.22,.12,.043)],m_dark),
    ], "Part_Boot")

    # 2. Sculpted Glove (puffy arcade fighting glove with cuff & thumb)
    join_parts([
        add_part("sphere", "gl1", loc=(0.15, 0, 0), scale=(0.38, 0.34, 0.34), mat=m_white),
        add_part("sphere", "gl2", loc=(0.05, 0.28, 0.18), scale=(0.18, 0.16, 0.16), mat=m_white),
        add_part("torus", "gl3", loc=(-0.22, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.30, 0.30, 0.22), mat=m_white),
    ], "Part_Glove")

    # 3. Sculpted Bowler Hat + Band (Bario)
    join_parts([
        add_part("sphere", "bh1", loc=(0, 0, 0.22), scale=(0.82, 0.82, 0.58), mat=m_gold),
        add_part("cyl", "bh2", loc=(0, 0, -0.02), scale=(1.12, 1.12, 0.06), mat=m_gold),
        add_part("torus", "bh2b", loc=(0, 0, -0.02), scale=(1.08, 1.08, 0.12), mat=m_gold),
        add_part("cyl", "bh3", loc=(0, 0, 0.08), scale=(0.84, 0.84, 0.10), mat=m_amber),
    ], "Hat_Bowler")

    # 4. Sculpted Doctor Head-Mirror (Dr. Bario)
    join_parts([
        add_part("torus", "hm1", loc=(0, 0, 0.08), scale=(0.92, 0.92, 0.08), mat=m_chrome),
        add_part("cyl", "hm2", loc=(0.92, 0, 0.22), rot=(0, math.pi / 2, 0), scale=(0.34, 0.34, 0.06), mat=m_chrome),
        add_part("torus", "hm3", loc=(0.92, 0, 0.22), rot=(0, math.pi / 2, 0), scale=(0.34, 0.34, 0.08), mat=m_gold),
    ], "Hat_HeadMirror")

    # 5. Baseball cap. CharRed dome and CharBlue brim recolor together, except Mess.
    join_parts([
        add_part("sphere", "cp1", loc=(0, 0, 0.28), scale=(0.86, 0.86, 0.46), mat=m_red),
        add_part("cube", "cp2", loc=(0.78, 0, 0.02), rot=(0, 0, -0.18), scale=(0.52, 0.58, 0.045), mat=m_blue, bevel=0.015),
        add_part("sphere", "cp3", loc=(0, 0, 0.68), scale=(0.14, 0.14, 0.10), mat=m_white),
    ], "Hat_Cap")

    # 6. Sculpted Bird Racer Helmet (Captain Pigeon)
    join_parts([
        add_part("sphere", "ph1", loc=(0, 0, 0), scale=(1.04, 1.02, 1.02), mat=m_gold),
        add_part("sphere", "ph2", loc=(0.62, 0, -0.02), scale=(0.55, 0.92, 0.28), mat=m_cyan),
        add_part("cone", "ph3", loc=(-0.05, 0.72, 0.55), rot=(0.7, -0.35, 0.4), scale=(0.18, 0.10, 0.72), mat=m_white),
        add_part("cone", "ph4", loc=(-0.05, -0.72, 0.55), rot=(-0.7, -0.35, -0.4), scale=(0.18, 0.10, 0.72), mat=m_white),
        add_part("cone", "ph5", loc=(0.95, 0, -0.42), rot=(0, math.pi / 2 + 0.35, 0), scale=(0.22, 0.28, 0.42), mat=m_gold),
        add_part("cube", "ph6", loc=(-0.55, 0, -0.15), rot=(0.2, 0.4, 0), scale=(0.55, 0.10, 0.16), mat=m_red, bevel=0.02),
    ], "Hat_BirdHelmet")

    # 7. Sculpted Fox / Coyote Ears + Snout + Aviator Shades (Faux)
    join_parts([
        sweep("Fox muzzle",[(.43,0,-.26,.65,.38),(.77,0,-.29,.61,.33),(1.21,0,-.24,.39,.25),
              (1.51,0,-.15,.21,.15)],m_cream),
        add_part("sphere", "fx2", loc=(1.48,0,-.12), scale=(.20,.24,.15),mat=m_dark),
        *[sweep("Cheek tuft",[(.57,s*.58,-.30,.29,.20),(.20,s*.84,-.30,.29,.19),
                (-.19,s*.96,-.22,.24,.14),(-.62,s*1.01,-.03,.015,.014)],m_cream) for s in [-1,1]],
        add_part("cone", "fx3", loc=(-0.1, 0.52, 1.02), rot=(0.25, -0.15, 0), scale=(0.30, 0.22, 0.72), mat=m_orange),
        add_part("cone", "fx4", loc=(-0.1, -0.52, 1.02), rot=(-0.25, -0.15, 0), scale=(0.30, 0.22, 0.72), mat=m_orange),
        add_part("cone", "fx5", loc=(-0.02, 0.52, 0.92), rot=(0.25, -0.15, 0), scale=(0.14, 0.10, 0.42), mat=m_cream),
        add_part("cone", "fx6", loc=(-0.02, -0.52, 0.92), rot=(-0.25, -0.15, 0), scale=(0.14, 0.10, 0.42), mat=m_cream),
    ], "Hat_FoxHead")

    # 8. Sculpted Toucan Beak + Aviator Shades (Falcon't)
    join_parts([
        sweep("Bill",[(.43,0,-.25,.39,.30),(.77,0,-.10,.61,.48),(1.25,0,-.03,.58,.49),
              (1.74,0,-.13,.44,.40),(2.06,0,-.32,.29,.27),(2.18,0,-.48,.16,.15)],m_orange),
        sweep("Bill tip",[(1.93,0,-.25,.31,.26),(2.12,0,-.36,.24,.23),(2.26,0,-.53,.13,.14),
              (2.24,0,-.72,.016,.02)],m_dark),
        sweep("Bill seam",[(.69,-.38,-.30,.13,.07),(1.16,-.40,-.30,.16,.06),(1.70,-.30,-.32,.11,.04),
              (2.11,-.14,-.46,.03,.025)],m_brown),
        add_part("cone", "tc3", loc=(-0.15, 0, 0.95), rot=(0.15, -0.2, 0), scale=(0.16, 0.10, 0.55), mat=m_blue),
        add_part("cone", "tc4", loc=(-0.35, 0.16, 0.72), rot=(0.2, -0.5, 0.3), scale=(0.12, 0.08, 0.38), mat=m_blue),
        add_part("cone", "tc5", loc=(-0.35, -0.16, 0.72), rot=(-0.2, -0.5, -0.3), scale=(0.12, 0.08, 0.38), mat=m_blue),
    ], "Hat_ToucanHead")

    # 9. Sculpted Spiked Turtle Shell + Horns (Sourzer)
    join_parts([
        add_part("sphere", "sh1", loc=(0, 0, 0), scale=(0.85, 1.05, 1.15), mat=m_green),
        add_part("torus", "sh2", loc=(0.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.95, 1.05, 0.26), mat=m_white),
        add_part("cone", "sh3", loc=(-0.82, 0, 0.55), rot=(0, -1.1, 0), scale=(0.24, 0.24, 0.55), mat=m_white),
        add_part("cone", "sh4", loc=(-0.92, 0, 0.0), rot=(0, -1.57, 0), scale=(0.26, 0.26, 0.58), mat=m_white),
        add_part("cone", "sh5", loc=(-0.82, 0, -0.55), rot=(0, -2.0, 0), scale=(0.24, 0.24, 0.55), mat=m_white),
        add_part("cone", "sh6", loc=(-0.55, 0.65, 0.15), rot=(-0.6, -1.2, 0), scale=(0.22, 0.22, 0.48), mat=m_white),
        add_part("cone", "sh7", loc=(-0.55, -0.65, 0.15), rot=(0.6, -1.2, 0), scale=(0.22, 0.22, 0.48), mat=m_white),
        add_part("cyl", "sh8", loc=(-1.65, 0.58, 0.05), rot=(0.42, 0.55, 0), scale=(0.07, 0.07, 1.25), mat=m_chrome),
        add_part("cyl", "sh9", loc=(-1.65, -0.58, 0.05), rot=(-0.42, 0.55, 0), scale=(0.07, 0.07, 1.25), mat=m_chrome),
        add_part("cyl", "sh10", loc=(-2.25, 0, 0.72), rot=(math.pi / 2, 0.15, 0), scale=(0.075, 0.075, 0.78), mat=m_chrome),
        add_part("cyl", "sh11", loc=(-2.05, 0, 0.28), rot=(0.9, 0.2, 0), scale=(0.05, 0.05, 0.42), mat=m_dark),
    ], "Part_SpikedShell")

    # 10. Sculpted Space HVAC Helmet + Visor + Pauldrons (Shamus)
    join_parts([
        add_part("sphere", "sm1", loc=(-0.28, 0, 0.05), scale=(0.82, 1.02, 1.02), mat=m_red),
        add_part("torus", "sm1b", loc=(0.15, 0, 0.02), rot=(0, math.pi / 2, 0), scale=(0.92, 0.92, 0.22), mat=m_red),
        add_part("cube", "sm2", loc=(0.55, 0.22, 0.28), rot=(0.55, 0.2, 0.4), scale=(0.10, 0.28, 0.08), mat=m_cyan, bevel=0.02),
        add_part("cube", "sm2b", loc=(0.55, -0.22, 0.28), rot=(-0.55, 0.2, -0.4), scale=(0.10, 0.28, 0.08), mat=m_cyan, bevel=0.02),
        add_part("cube", "sm3", loc=(0.05, 0, 0.88), scale=(0.55, 0.22, 0.22), mat=m_chrome, bevel=0.04),
        add_part("cyl", "sm4", loc=(-0.2, 0.92, -0.15), rot=(math.pi / 2, 0, 0), scale=(0.24, 0.24, 0.2), mat=m_gold),
        add_part("cyl", "sm5", loc=(-0.2, -0.92, -0.15), rot=(math.pi / 2, 0, 0), scale=(0.24, 0.24, 0.2), mat=m_gold),
    ], "Hat_SpaceHelm")

    # 11. Sculpted Elf Cap + Swept Hair (Zink / Tiny Zink)
    join_parts([
        add_part("cone", "ec1", loc=(-0.55, 0, 0.52), rot=(0, -1.05, 0), scale=(0.76, 0.76, 1.45), mat=m_green),
        add_part("torus", "ec2", loc=(0.0, 0, 0.22), rot=(0, 0.35, 0), scale=(0.88, 0.88, 0.18), mat=m_gold),
    ], "Hat_ElfCap")

    # 12. Sculpted Royal Crown / Tiara + Flowing Hair (Garth / Screech / Velda)
    join_parts([
        add_part("torus", "cr1", loc=(0, 0, 0.55), scale=(0.74, 0.74, 0.14), mat=m_gold),
        add_part("cone", "cr2", loc=(0.72, 0, 0.88), scale=(0.18, 0.18, 0.45), mat=m_gold),
        add_part("cone", "cr3", loc=(0.42, 0.58, 0.82), scale=(0.14, 0.14, 0.36), mat=m_gold),
        add_part("cone", "cr4", loc=(0.42, -0.58, 0.82), scale=(0.14, 0.14, 0.36), mat=m_gold),
        add_part("sphere", "cr5", loc=(0.74, 0, 0.74), scale=(0.14, 0.14, 0.14), mat=m_cyan),
    ], "Hat_Crown")

    # 13. Sculpted Curly Mustache (Bario / Dr. Bario / Squeegi)
    join_parts([
        add_part("sphere", "ms1", loc=(0.88, 0.16, -0.16), scale=(0.30, 0.46, 0.26), mat=m_brown),
        add_part("sphere", "ms2", loc=(0.88, -0.16, -0.16), scale=(0.30, 0.46, 0.26), mat=m_brown),
        add_part("sphere", "ms3", loc=(0.78, 0.58, -0.04), scale=(0.22, 0.32, 0.22), mat=m_brown),
        add_part("sphere", "ms4", loc=(0.78, -0.58, -0.04), scale=(0.22, 0.32, 0.22), mat=m_brown),
        add_part("sphere", "ms5", loc=(0.58, 0.82, 0.06), scale=(0.16, 0.22, 0.18), mat=m_brown),
        add_part("sphere", "ms6", loc=(0.58, -0.82, 0.06), scale=(0.16, 0.22, 0.18), mat=m_brown),
    ], "Part_Mustache")

    # 14. Sculpted Giant Reading Glasses + Tie (Wonky Kong)
    join_parts([
        add_part("torus", "glg1", loc=(0.92, 0.42, 0.12), rot=(0, math.pi / 2, 0), scale=(0.46, 0.46, 0.46), mat=m_chrome, maj=1.0, min=0.045),
        add_part("torus", "glg2", loc=(0.92, -0.42, 0.12), rot=(0, math.pi / 2, 0), scale=(0.46, 0.46, 0.46), mat=m_chrome, maj=1.0, min=0.045),
        add_part("cube", "glg3", loc=(0.94, 0, 0.16), scale=(0.03, 0.16, 0.025), mat=m_chrome),
    ], "Hat_Glasses")

    # 15. Sculpted Flowing Cape (Garth, Troy, Bario, Dadondorf)
    join_parts([
        add_part("cube", "cp_a", loc=(-0.15, 0, 0.45), rot=(0, 0.22, 0), scale=(0.08, 0.72, 0.55), mat=m_neutral, bevel=0.03),
        add_part("cube", "cp_b", loc=(-0.38, 0, -0.45), rot=(0, 0.34, 0), scale=(0.08, 0.92, 0.58), mat=m_neutral, bevel=0.03),
    ], "Part_Cape")

    # 16. Sculpted Bushy / Curved Tail (Faux, Mewtooth, Chikapu)
    join_parts([
        add_part("sphere", "tl1", loc=(-0.35, 0, 0.05), scale=(0.45, 0.32, 0.32), mat=m_neutral),
        add_part("sphere", "tl2", loc=(-0.82, 0, 0.22), scale=(0.52, 0.36, 0.36), mat=m_neutral),
        add_part("cone", "tl3", loc=(-1.32, 0, 0.36), rot=(0, -1.3, 0), scale=(0.34, 0.34, 0.45), mat=m_white),
    ], "Part_Tail")

    # 17. Sculpted Colossal Quilted Oven Mitt Boss (Master Mitt)
    palm = join_parts([
        add_part("sphere", "mm1", loc=(0, 0, 0.45), scale=(1.05, 0.56, 1.25), mat=m_white),
        add_part("cyl", "mm2", loc=(0, 0, -0.82), scale=(0.92, 0.52, 0.42), mat=m_red),
        add_part("torus", "mm3", loc=(0, 0, -0.45), scale=(0.94, 0.54, 0.18), mat=m_gold),
        add_part("cube", "mm10", loc=(0.05, 0.02, 0.35), rot=(0.4, 0.2, 0.7), scale=(0.85, 0.015, 0.03), mat=m_red),
        add_part("cube", "mm11", loc=(0.05, -0.02, 0.35), rot=(-0.4, -0.2, -0.7), scale=(0.85, 0.015, 0.03), mat=m_red),
        add_part("cube", "mm12", loc=(-0.1, 0, 0.9), rot=(0, 0.3, 0.8), scale=(0.55, 0.015, 0.03), mat=m_gold),
    ], "Boss_MasterMitt")
    for i, (x, z, length, tilt) in enumerate([(1.00,-.24,.94,.84),(.69,.95,.93,.18),
            (.25,1.07,1.12,.05),(-.22,1.09,1.05,-.07),(-.66,.96,.82,-.20)]):
        pivot = bpy.data.objects.new("MittDigit"+str(i),None)
        bpy.context.collection.objects.link(pivot)
        pivot.parent = palm
        pivot.location = (x,0,z-palm.location.z)
        pivot.rotation_euler.y = tilt
        finger = add_part("sphere","QuiltedDigit",scale=(.28,.30,length*.60),mat=m_white)
        finger.parent = pivot
        finger.location.z = length*.43


    # 18. Sculpted Tied Burlap Sagging Bag (Home-Run Derby)
    join_parts([
        add_part("sphere", "sb1", loc=(0, 0, 0), scale=(0.72, 0.58, 1.05), mat=m_burlap),
        add_part("torus", "sb2", loc=(0, 0, 0.85), scale=(0.36, 0.36, 0.14), mat=m_red),
        add_part("cone", "sb3", loc=(0, 0, 1.18), rot=(math.pi, 0, 0), scale=(0.46, 0.40, 0.38), mat=m_burlap),
        add_part("cube", "sb4", loc=(0.68, 0, 0.18), scale=(0.06, 0.44, 0.44), mat=m_gold),
    ], "NPC_SaggingBag")

    # 19. Sculpted Trash-Can Lid Shield (Zink / Tiny Zink)
    join_parts([
        add_part("cyl", "tl1", loc=(0, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.78, 0.78, 0.08), mat=m_chrome),
        add_part("torus", "tl2", loc=(0.06, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.74, 0.74, 0.08), mat=m_dark),
        add_part("torus", "tl3", loc=(0.14, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.24, 0.18, 0.08), mat=m_chrome),
    ], "Part_TrashLid")

    # 20. Sculpted Accountant Necktie (Wonky Kong)
    join_parts([
        add_part("cube", "nt1", loc=(0.04, 0, 0.38), scale=(0.08, 0.16, 0.14), mat=m_red, bevel=0.02),
        add_part("cone", "nt2", loc=(0.04, 0, -0.18), rot=(math.pi, 0, 0), scale=(0.10, 0.22, 0.52), mat=m_red),
    ], "Part_Tie")

    # 21. Sculpted Dragon Horns (Sourzer)
    join_parts([
        add_part("cone", "dh1", loc=(0.1, 0.62, 0.82), rot=(0.45, 0.2, 0), scale=(0.22, 0.22, 0.65), mat=m_white),
        add_part("cone", "dh2", loc=(0.1, -0.62, 0.82), rot=(-0.45, 0.2, 0), scale=(0.22, 0.22, 0.65), mat=m_white),
    ], "Part_DragonHorns")

    # 22. Sculpted Sleep Mask (Gigglefluff)
    join_parts([
        add_part("sphere", "slm1", loc=(0.52, 0.28, 0.56), scale=(0.22, 0.34, 0.22), mat=m_cyan),
        add_part("sphere", "slm2", loc=(0.52, -0.28, 0.56), scale=(0.22, 0.34, 0.22), mat=m_cyan),
        add_part("torus", "slm3", loc=(0, 0, 0.45), scale=(0.86, 0.86, 0.08), mat=m_cyan),
    ], "Hat_SleepMask")

    # 23. Flaming grill beard (Dadondorf)
    join_parts([
        add_part("sphere", "bd1", loc=(0.72, 0, -0.28), scale=(0.28, 0.55, 0.42), mat=m_orange),
        add_part("sphere", "bd2", loc=(0.55, 0.28, -0.55), scale=(0.22, 0.28, 0.38), mat=m_orange),
        add_part("sphere", "bd3", loc=(0.55, -0.28, -0.55), scale=(0.22, 0.28, 0.38), mat=m_orange),
        add_part("cone", "bd4", loc=(0.85, 0.18, -0.15), rot=(0.4, 0.6, 0), scale=(0.10, 0.08, 0.28), mat=m_red),
        add_part("cone", "bd5", loc=(0.85, -0.18, -0.15), rot=(-0.4, 0.6, 0), scale=(0.10, 0.08, 0.28), mat=m_gold),
    ], "Part_Beard")

    # 24. Layered hair bun (Screech) and spiky crest (Wonky / Troy / Mess)
    join_parts([
        add_part("sphere", "hb1", loc=(0, 0, 0.55), scale=(0.55, 0.48, 0.42), mat=m_amber),
        add_part("sphere", "hb2", loc=(0.05, 0, 0.95), scale=(0.38, 0.34, 0.32), mat=m_amber),
        add_part("sphere", "hb3", loc=(-0.15, 0.22, 0.35), scale=(0.28, 0.22, 0.28), mat=m_brown),
        add_part("sphere", "hb4", loc=(-0.15, -0.22, 0.35), scale=(0.28, 0.22, 0.28), mat=m_brown),
    ], "Part_HairBun")
    join_parts([
        add_part("cone", "hc1", loc=(0.02, 0, 1.05), scale=(0.28, 0.18, 0.82), mat=m_orange),
        add_part("cone", "hc2", loc=(-0.12, 0.36, 0.78), rot=(0.4, 0, 0.15), scale=(0.20, 0.14, 0.62), mat=m_red),
        add_part("cone", "hc3", loc=(-0.12, -0.36, 0.78), rot=(-0.4, 0, -0.15), scale=(0.20, 0.14, 0.62), mat=m_orange),
        add_part("cone", "hc4", loc=(0.38, 0.16, 0.52), rot=(0.15, 0.85, 0), scale=(0.16, 0.12, 0.48), mat=m_red),
        add_part("cone", "hc5", loc=(0.38, -0.16, 0.52), rot=(-0.15, 0.85, 0), scale=(0.16, 0.12, 0.48), mat=m_orange),
        add_part("cone", "hc6", loc=(-0.18, 0, 0.42), rot=(0, -0.55, 0), scale=(0.18, 0.12, 0.38), mat=m_gold),
    ], "Part_HairCrest")

    # 25. Gold monocle and chain (Bario)
    join_parts([
        add_part("torus", "mo1", loc=(0.9, 0.32, 0.08), rot=(0, math.pi / 2, 0), scale=(0.28, 0.28, 0.08), mat=m_gold),
        add_part("cyl", "mo2", loc=(0.55, 0.55, -0.15), rot=(0.6, 0, 0.4), scale=(0.025, 0.025, 0.35), mat=m_gold),
        add_part("sphere", "mo3", loc=(0.35, 0.62, -0.42), scale=(0.06, 0.06, 0.06), mat=m_gold),
    ], "Part_Monocle")

    # 26. Long toothy dino snout (Broshee) and dorsal bumps
    join_parts([
        add_part("sphere", "sn1", loc=(0.85, 0, -0.12), scale=(0.78, 0.40, 0.34), mat=m_lime),
        add_part("sphere", "sn2", loc=(1.38, 0, -0.18), scale=(0.30, 0.24, 0.18), mat=m_cream),
        add_part("cube", "sn3", loc=(1.08, 0, -0.36), scale=(0.30, 0.24, 0.05), mat=m_white, bevel=0.02),
        add_part("sphere", "sn4", loc=(1.18, 0.12, 0.04), scale=(0.07, 0.06, 0.05), mat=m_dark),
        add_part("sphere", "sn5", loc=(1.18, -0.12, 0.04), scale=(0.07, 0.06, 0.05), mat=m_dark),
    ], "Part_DinoSnout")
    join_parts([
        add_part("cone", "ds1", loc=(0, 0, 0.35), scale=(0.16, 0.12, 0.28), mat=m_lime),
        add_part("cone", "ds2", loc=(-0.28, 0, 0.22), rot=(0, -0.4, 0), scale=(0.14, 0.10, 0.24), mat=m_lime),
        add_part("cone", "ds3", loc=(0.22, 0, 0.18), rot=(0, 0.3, 0), scale=(0.12, 0.09, 0.20), mat=m_green),
    ], "Part_Spines")

    # 27. Ribbed dryer-duct coil (Shamus)
    duct = []
    for i in range(6):
        duct.append(add_part("torus", f"dc{i}", loc=(0, 0, -0.4 + i * 0.16), scale=(0.26, 0.26, 0.07), mat=m_chrome))
    join_parts(duct, "Part_DuctCoil")

    # 28. Boxy cardboard Nana-Bot
    join_parts([
        add_part("cube", "nb1", loc=(0, 0, 0.15), scale=(0.42, 0.36, 0.48), mat=m_pink, bevel=0.04),
        add_part("cube", "nb2", loc=(0, 0, 0.78), scale=(0.36, 0.32, 0.32), mat=m_red, bevel=0.03),
        add_part("cyl", "nb3", loc=(0, 0, 1.18), scale=(0.04, 0.04, 0.22), mat=m_chrome),
        add_part("sphere", "nb4", loc=(0, 0, 1.42), scale=(0.08, 0.08, 0.08), mat=m_cyan),
        add_part("cube", "nb5", loc=(0.36, 0.12, 0.82), scale=(0.06, 0.08, 0.08), mat=m_cyan),
        add_part("cube", "nb6", loc=(0.36, -0.12, 0.82), scale=(0.06, 0.08, 0.08), mat=m_cyan),
        add_part("cube", "nb7", loc=(0.15, 0.48, 0.28), rot=(0, 0, 0.4), scale=(0.10, 0.28, 0.10), mat=m_dark, bevel=0.02),
        add_part("cube", "nb8", loc=(0.15, -0.48, 0.28), rot=(0, 0, -0.4), scale=(0.10, 0.28, 0.10), mat=m_dark, bevel=0.02),
    ], "Buddy_NanaBot")

    # 29. Upright velvet mouse ears, pointed bolt ears, and plush cat tufts.
    round_ears, bolt_ears, cat_ears = [], [], []
    for s in [-1,1]:
        for dest,x,y,z,scale,paint in [
            (round_ears,0,.64, .80,(.17,.43,.66),m_amber),
            (round_ears,.14,.65,.84,(.07,.29,.48),m_brown),
            (bolt_ears,0,.53,.76,(.18,.27,.74),m_gold),
            (bolt_ears,.012,.69,1.25,(.14,.18,.34),m_dark)]:
            dest.append(add_part("sphere","Ear",loc=(x,s*y,z),rot=(-s*.32,-.12,0),scale=scale,mat=paint))
        cat_ears.append(add_part("cone","Ear",loc=(-.08,s*.66,.71),rot=(-s*.32,-.12,0),scale=(.30,.34,.48),mat=m_pink,verts=16))
        cat_ears.append(add_part("cone","Lining",loc=(.14,s*.66,.76),rot=(-s*.32,-.12,0),scale=(.11,.22,.31),mat=m_cream,verts=16))
    join_parts(round_ears,"Part_MouseEars")
    join_parts(bolt_ears,"Part_BoltEars")
    join_parts(cat_ears,"Part_CatEars")
    swirl = sweep("Swirl",[(-.27,0,.44,.33,.24),(.13,0,.55,.33,.21),(.28,0,.83,.24,.18),
                  (.20,0,1.00,.19,.14),(-.08,0,1.08,.10,.09),(-.22,0,.94,.02,.03)],m_pink)
    swirl.name = "Part_HairSwirl"

    # 30. Pointed elf ears and a pointed astrologer hood
    join_parts([
        add_part("cone", "ee1", loc=(0.15, 0.78, 0.15), rot=(0, 0, -1.15), scale=(0.16, 0.12, 0.42), mat=m_cream),
        add_part("cone", "ee2", loc=(0.15, -0.78, 0.15), rot=(0, 0, 1.15), scale=(0.16, 0.12, 0.42), mat=m_cream),
    ], "Part_ElfEars")
    # Cone tip is +Z. Ry +1.15 parks the solid base behind the skull instead of across the mouth.
    join_parts([
        add_part("cone", "hd1", loc=(-0.55, 0, 0.72), rot=(0, 1.15, 0), scale=(0.88, 0.82, 1.28), mat=m_neutral),
        add_part("torus", "hd2", loc=(-0.05, 0, 0.85), rot=(0.4, 0.2, 0), scale=(0.48, 0.42, 0.08), mat=m_gold),
    ], "Hat_Hood")

    # Flame-shaped swept locks overlap at the roots and open out at the tips.
    roots = [add_part("sphere","Hair foundation",(-.20,0,.54),scale=(.91,.94,.50),mat=m_red)]
    for i,(side,x,tip) in enumerate([(-.63,.22,.90),(.63,.22,.90),(-.28,.49,1.32),(.28,.34,1.40),
                                     (0,.08,1.68),(-.46,-.34,1.28),(.42,-.43,1.21),(0,-.64,1.04)]):
        roots.append(sweep("Swept lock",[(x,side,.46,.30,.28),(x+.08,side,.77,.35,.30),
                    (x-.19,side,tip,.24,.22),(x-.61,side,tip+.24,.028,.025)],m_orange if i%3 else m_red))
    join_parts(roots,"Hair_FlameSweep")

    # A single strip follows the jaw and opens toward the painted face.
    verts, faces = [], []
    for i in range(19):
        a = (i-9)*math.pi/11
        for x,r in [(.47,.94),(.49,1.04),(.27,1.12),(-.34,1.11),(-.83,.87),(-1.08,.32)]:
            verts.append((x,r*math.sin(a),.02+r*math.cos(a)))
    for i in range(18):
        for j in range(5):
            k=i*6+j
            faces.append((k,k+6,k+7,k+1))
    polish(mesh_object("Part_RoyalCowl",verts,faces,m_neutral),subdiv=2)

    # 31. Tall lime top hat (Squeegi)
    join_parts([
        add_part("cyl", "th1", loc=(0, 0, 1.25), scale=(0.58, 0.58, 1.05), mat=m_lime),
        add_part("cyl", "th2", loc=(0, 0, 0.18), scale=(1.08, 1.08, 0.07), mat=m_lime),
        add_part("torus", "th3", loc=(0, 0, 0.48), scale=(0.62, 0.62, 0.08), mat=m_dark),
    ], "Hat_TopHat")

    # 32. Mess backpack and Spitzu copper battery
    join_parts([
        add_part("cube", "bp1", loc=(-0.15, 0, 0.15), scale=(0.28, 0.42, 0.48), mat=m_gold, bevel=0.03),
        add_part("cube", "bp2", loc=(0.02, 0.32, 0.42), rot=(0.35, 0, 0.15), scale=(0.05, 0.08, 0.28), mat=m_dark),
        add_part("cube", "bp3", loc=(0.02, -0.32, 0.42), rot=(-0.35, 0, -0.15), scale=(0.05, 0.08, 0.28), mat=m_dark),
        add_part("sphere", "bp4", loc=(-0.02, 0, 0.48), scale=(0.08, 0.10, 0.08), mat=m_red),
    ], "Part_Backpack")
    join_parts([
        add_part("cube", "bat1", loc=(-0.18, 0, 0.18), scale=(0.22, 0.34, 0.42), mat=m_copper, bevel=0.03),
        add_part("cyl", "bat2", loc=(-0.02, 0.12, 0.62), scale=(0.07, 0.07, 0.16), mat=m_chrome),
        add_part("cyl", "bat3", loc=(-0.02, -0.12, 0.62), scale=(0.07, 0.07, 0.16), mat=m_gold),
        add_part("cube", "bat4", loc=(0.04, 0, 0.12), scale=(0.035, 0.18, 0.06), mat=m_dark),
    ], "Part_Battery")

    # 33. Sourzer mohawk, snout, spiked collar
    join_parts([
        add_part("cone", "mk1", loc=(0.05, 0, 1.05), scale=(0.16, 0.10, 0.55), mat=m_red),
        add_part("cone", "mk2", loc=(-0.08, 0, 0.72), rot=(0, -0.35, 0), scale=(0.14, 0.09, 0.42), mat=m_red),
        add_part("cone", "mk3", loc=(0.22, 0, 0.62), rot=(0, 0.55, 0), scale=(0.12, 0.08, 0.34), mat=m_orange),
        add_part("cone", "mk4", loc=(-0.28, 0, 0.48), rot=(0, -0.8, 0), scale=(0.11, 0.08, 0.30), mat=m_red),
    ], "Part_Mohawk")
    join_parts([
        add_part("sphere", "sz1", loc=(0.82, 0, -0.10), scale=(0.62, 0.42, 0.32), mat=m_orange),
        add_part("sphere", "sz2", loc=(1.28, 0, -0.16), scale=(0.32, 0.28, 0.18), mat=m_gold),
        add_part("sphere", "sz3", loc=(1.08, 0.14, 0.04), scale=(0.07, 0.06, 0.045), mat=m_dark),
        add_part("sphere", "sz4", loc=(1.08, -0.14, 0.04), scale=(0.07, 0.06, 0.045), mat=m_dark),
    ], "Part_Snout")
    join_parts([
        add_part("torus", "col1", loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.78, 0.72, 0.16), mat=m_dark),
        add_part("cone", "col2", loc=(0.12, 0, 0.55), scale=(0.10, 0.10, 0.28), mat=m_chrome),
        add_part("cone", "col3", loc=(-0.02, 0.48, 0.22), rot=(0.8, 0, 0), scale=(0.08, 0.08, 0.24), mat=m_white),
        add_part("cone", "col4", loc=(-0.02, -0.48, 0.22), rot=(-0.8, 0, 0), scale=(0.08, 0.08, 0.24), mat=m_white),
        add_part("cone", "col5", loc=(-0.22, 0.22, 0.38), rot=(0.35, -0.4, 0), scale=(0.07, 0.07, 0.20), mat=m_chrome),
        add_part("cone", "col6", loc=(-0.22, -0.22, 0.38), rot=(-0.35, -0.4, 0), scale=(0.07, 0.07, 0.20), mat=m_chrome),
    ], "Part_Collar")

    # 34. Chikapu lightning tail and Shriek kunai
    join_parts([
        add_part("cube", "lt1", loc=(-0.15, 0, 0.05), rot=(0, 0, 0.55), scale=(0.28, 0.07, 0.07), mat=m_gold, bevel=0.012),
        add_part("cube", "lt2", loc=(-0.48, 0.18, 0.10), rot=(0, 0, -0.75), scale=(0.26, 0.065, 0.065), mat=m_gold, bevel=0.012),
        add_part("cube", "lt3", loc=(-0.78, -0.06, 0.16), rot=(0, 0, 0.65), scale=(0.24, 0.06, 0.06), mat=m_gold, bevel=0.012),
        add_part("cone", "lt4", loc=(-1.08, 0.10, 0.20), rot=(0, -1.15, 0.35), scale=(0.10, 0.10, 0.22), mat=m_cyan),
    ], "Part_BoltTail")
    join_parts([
        kay_prop("dagger","Kunai blade",m_chrome,(.96,.09,.22),(.18,0,0),
                 Matrix.Rotation(math.pi/2,4,"Y") @ FRONT) or add_part("cone", "kn1", loc=(0.32, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.07, 0.045, 0.42), mat=m_chrome),
        add_part("torus", "kn2", loc=(-0.02, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.12, 0.10, 0.035), mat=m_dark),
        add_part("cyl", "kn3", loc=(-0.22, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.025, 0.025, 0.16), mat=m_dark),
    ], "Part_Kunai")

    kay_prop("shield_round","Part_RoundShield",m_chrome,(.28,1.8,1.8))
    build_sculpts(m_neutral, m_cream, m_brown, m_pink, m_dark)
    export_glb("characters.glb")


def build_weapons_pack():
    """High-detail PBR sculpted signature fighter weapons & props."""
    clear_scene()
    m_brass = make_mat("Brass", (1.0, 0.80, 0.22, 1), metallic=0.85, roughness=0.18)
    m_tip = make_mat("Tipper", (0.22, 0.95, 1.0, 1), emission=(0.22, 0.95, 1.0, 1), emission_strength=1.8)
    m_steel = make_mat("Steel", (0.82, 0.86, 0.92, 1), metallic=0.9, roughness=0.18)
    m_wood = make_mat("Wood", (0.65, 0.40, 0.20, 1), roughness=0.58)
    m_fire = make_mat("Fire", (1.0, 0.42, 0.10, 1), emission=(1.0, 0.45, 0.08, 1), emission_strength=2.0)
    m_dark = make_mat("Dark", (0.12, 0.14, 0.20, 1), metallic=0.45, roughness=0.35)
    m_red = make_mat("Red", (0.95, 0.20, 0.30, 1), roughness=0.32)
    m_cyan = make_mat("Cyan", (0.22, 0.92, 1.0, 1), emission=(0.22, 0.92, 1.0, 1), emission_strength=1.4)
    m_purple = make_mat("Purple", (0.68, 0.24, 0.98, 1), emission=(0.68, 0.24, 0.98, 1), emission_strength=1.2)
    m_magenta = make_mat("Magenta", (1.0, 0.12, 0.62, 1), emission=(1.0, 0.08, 0.55, 1), emission_strength=2.2)
    m_yellow = make_mat("Yellow", (1.0, 0.86, 0.16, 1), roughness=0.32)
    m_rubber = make_mat("Rubber", (0.16, 0.16, 0.18, 1), roughness=0.7)
    m_chrome = make_mat("Chrome", (0.84, 0.88, 0.94, 1), metallic=0.9, roughness=0.16)
    m_white = make_mat("White", (0.96, 0.97, 1.0, 1), roughness=0.28)

    # 1. Garth's Engraved Brass Yardstick-Rapier
    join_parts([
        kay_prop("sword_2handed","Engraved blade",m_brass,(2.88,.11,.56),(.93,0,0),
                 Matrix.Rotation(math.pi/2,4,"Y") @ FRONT) or add_part("cube", "ys1", loc=(1.05, 0, 0), scale=(1.2, 0.05, 0.16), mat=m_brass, bevel=0.02),
        sweep("Tipper",[(1.91,0,0,.060,.12),(2.12,0,0,.058,.11),(2.45,0,0,.014,.020),
              (2.51,0,0,.006,.007)],m_tip),
        add_part("torus", "ys3", loc=(-0.10, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.32, 0.32, 0.14), mat=m_brass),
        add_part("cyl", "ys4", loc=(-0.38, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.09, 0.09, 0.30), mat=m_dark),
    ], "Weapon_Yardstick")

    # 2. Troy's Flaming Broomstick
    join_parts([
        add_part("cyl", "fb1", loc=(0.82, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.08, 0.08, 1.05), mat=m_wood),
        add_part("cyl", "fb2", loc=(1.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.14, 0.14, 0.12), mat=m_brass),
        add_part("cone", "fb3", loc=(2.05, 0, 0), rot=(0, -math.pi / 2, 0), scale=(0.42, 0.34, 0.62), mat=m_fire),
        add_part("cone", "fb5", loc=(2.22, 0.16, 0.16), rot=(0.35, -1.25, 0.25), scale=(0.22, 0.18, 0.48), mat=m_yellow),
        add_part("cone", "fb6", loc=(2.28, -0.14, -0.06), rot=(-0.3, -1.4, -0.2), scale=(0.18, 0.16, 0.44), mat=m_fire),
        add_part("cone", "fb7", loc=(2.12, 0.02, 0.22), rot=(0.55, -1.15, 0), scale=(0.16, 0.14, 0.36), mat=m_red),
        add_part("ico", "fb4", loc=(2.05, 0, 0.12), scale=(0.18, 0.18, 0.18), mat=m_yellow, sub=1),
    ], "Weapon_FireBroom")

    # 3. Zink's Galvanized Pipe Wrench
    join_parts([
        add_part("cube", "pw1", loc=(0.65, 0, 0), scale=(0.80, 0.10, 0.16), mat=m_steel, bevel=0.03),
        add_part("cube", "pw2", loc=(0.55, 0, 0), scale=(0.38, 0.12, 0.18), mat=m_red, bevel=0.02),
        add_part("torus", "pw3", loc=(1.46, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.30, 0.30, 0.18), mat=m_steel),
    ], "Weapon_Wrench")

    # 4. Dadondorf's Grill Spatula of Doom
    join_parts([
        add_part("cyl", "gs1", loc=(0.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.07, 0.07, 0.78), mat=m_dark),
        add_part("cube", "gs2", loc=(1.28, 0, 0), scale=(0.12, 0.05, 0.22), mat=m_steel, bevel=0.012),
        add_part("cyl", "gs3", loc=(1.62, 0, 0.12), rot=(0, math.pi / 2, 0), scale=(0.035, 0.035, 0.38), mat=m_steel),
        add_part("cyl", "gs4", loc=(1.66, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.035, 0.035, 0.44), mat=m_steel),
        add_part("cyl", "gs5", loc=(1.62, 0, -0.12), rot=(0, math.pi / 2, 0), scale=(0.035, 0.035, 0.38), mat=m_steel),
    ], "Weapon_Spatula")

    # 5. Shamus's Duct-Tape Arm Cannon
    join_parts([
        add_part("cyl", "ac1", loc=(0.48, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.34, 0.34, 0.68), mat=m_steel),
        add_part("torus", "ac2", loc=(0.92, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.38, 0.38, 0.14), mat=m_brass),
        add_part("sphere", "ac3", loc=(1.12, 0, 0), scale=(0.28, 0.28, 0.28), mat=m_cyan),
    ], "Weapon_ArmCannon")

    # 6. Mr. Beep & Blob's neon "9" Judge Hammer
    join_parts([
        add_part("cyl", "jh1", loc=(0.48, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.06, 0.06, 0.62), mat=m_dark),
        add_part("torus", "jh2", loc=(1.22, 0, 0.16), rot=(0, math.pi / 2, 0), scale=(0.32, 0.32, 0.10), mat=m_magenta),
        add_part("cyl", "jh3", loc=(1.22, 0, -0.28), scale=(0.07, 0.07, 0.38), mat=m_magenta),
        add_part("torus", "jh4", loc=(1.22, 0, 0.16), rot=(0, math.pi / 2, 0), scale=(0.16, 0.16, 0.06), mat=m_cyan),
    ], "Weapon_JudgeHammer")

    # 7. Screech's Cast-Iron Frying Pan
    join_parts([
        add_part("cyl", "fp1", loc=(0.45, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.07, 0.07, 0.52), mat=m_dark),
        add_part("cyl", "fp2", loc=(1.18, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.46, 0.46, 0.12), mat=m_dark),
    ], "Weapon_FryingPan")

    # 8. Slush Shovelers' Snow Shovel
    join_parts([
        add_part("cyl", "sv1", loc=(0.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.07, 0.07, 0.72), mat=m_wood),
        add_part("cube", "sv2", loc=(1.35, 0, 0), scale=(0.42, 0.08, 0.46), mat=m_cyan, bevel=0.03),
    ], "Weapon_Shovel")

    # 9. Velda's Astro Crystal
    join_parts([
        add_part("ico", "vc1", loc=(0.85, 0, 0.12), scale=(0.42, 0.36, 0.38), mat=m_purple, sub=1),
        add_part("ico", "vc2", loc=(0.85, 0, 0.12), scale=(0.22, 0.18, 0.20), mat=m_cyan, sub=1),
        add_part("torus", "vc3", loc=(0.85, 0, 0.12), rot=(0.7, 0.35, 0), scale=(0.52, 0.48, 0.06), mat=m_cyan),
    ], "Weapon_Crystal")

    # 10. Squeegi's soapy window squeegee
    join_parts([
        add_part("cyl", "sq1", loc=(0.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.06, 0.06, 0.7), mat=m_purple),
        add_part("cube", "sq2", loc=(1.38, 0, 0.18), scale=(0.05, 0.06, 0.58), mat=m_chrome, bevel=0.012),
        add_part("cube", "sq2b", loc=(1.46, 0, 0.18), scale=(0.035, 0.045, 0.55), mat=m_cyan),
        add_part("cube", "sq3", loc=(1.40, 0, -0.08), scale=(0.04, 0.05, 0.48), mat=m_rubber),
        add_part("sphere", "sq4", loc=(1.22, 0.10, 0.36), scale=(0.07, 0.07, 0.07), mat=m_cyan),
        add_part("sphere", "sq5", loc=(1.52, -0.08, 0.32), scale=(0.055, 0.055, 0.055), mat=m_cyan),
    ], "Weapon_Squeegee")

    # 11. Tiny Zink's giant silver spork
    join_parts([
        add_part("cyl", "sk1", loc=(0.48, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.07, 0.07, 0.62), mat=m_steel),
        add_part("cube", "sk2", loc=(1.15, 0, 0), scale=(0.22, 0.05, 0.20), mat=m_steel, bevel=0.02),
        add_part("cone", "sk3", loc=(1.42, 0, 0.10), rot=(0, math.pi / 2, 0), scale=(0.05, 0.05, 0.22), mat=m_steel),
        add_part("cone", "sk4", loc=(1.42, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.05, 0.05, 0.24), mat=m_steel),
        add_part("cone", "sk5", loc=(1.42, 0, -0.10), rot=(0, math.pi / 2, 0), scale=(0.05, 0.05, 0.22), mat=m_steel),
    ], "Weapon_Spork")

    # 12. Dr. Bario's two-tone giant pill
    join_parts([
        add_part("cyl", "pl1", loc=(0.62, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.26, 0.26, 0.32), mat=m_red),
        add_part("cyl", "pl2", loc=(1.05, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.26, 0.26, 0.32), mat=m_yellow),
        add_part("sphere", "pl3", loc=(0.42, 0, 0), scale=(0.26, 0.26, 0.26), mat=m_red),
        add_part("sphere", "pl4", loc=(1.26, 0, 0), scale=(0.26, 0.26, 0.26), mat=m_yellow),
    ], "Weapon_Pill")

    # 13. Mess's wooden baseball bat
    join_parts([
        add_part("cyl", "bt1", loc=(0.35, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.07, 0.07, 0.42), mat=m_wood),
        add_part("cyl", "bt2", loc=(1.05, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.13, 0.13, 0.55), mat=m_wood),
        add_part("sphere", "bt3", loc=(0.05, 0, 0), scale=(0.10, 0.10, 0.10), mat=m_dark),
        add_part("torus", "bt4", loc=(0.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.10, 0.10, 0.05), mat=m_brass),
    ], "Weapon_Bat")

    export_glb("weapons.glb")


def build_items_pack():
    """Sculpted high-detail PBR meshes for all 24 Bizarro Melee items and 8 Critter Summons."""
    clear_scene()
    m_wood = make_mat("Wood", (0.72, 0.45, 0.22, 1), roughness=0.6)
    m_red = make_mat("Red", (0.94, 0.20, 0.28, 1), roughness=0.32)
    m_cyan = make_mat("Cyan", (0.18, 0.92, 1.0, 1), metallic=0.2, roughness=0.18, emission=(0.18, 0.92, 1.0, 1), emission_strength=1.8)
    m_gold = make_mat("Gold", (1.0, 0.82, 0.18, 1), metallic=0.78, roughness=0.2, emission=(1.0, 0.78, 0.12, 1), emission_strength=0.45)
    m_dark = make_mat("Dark", (0.12, 0.14, 0.20, 1), metallic=0.55, roughness=0.32)
    m_white = make_mat("White", (0.95, 0.96, 1.0, 1), roughness=0.3)
    m_green = make_mat("Green", (0.20, 0.85, 0.36, 1), roughness=0.32)
    m_purple = make_mat("Purple", (0.65, 0.26, 0.95, 1), roughness=0.32)
    m_orange = make_mat("Orange", (1.0, 0.48, 0.12, 1), roughness=0.35)
    m_chrome = make_mat("Chrome", (0.84, 0.88, 0.94, 1), metallic=0.9, roughness=0.16)
    m_pink = make_mat("Pink", (1.0, 0.48, 0.78, 1), roughness=0.35)

    # 1. Home-Run Plunger Bat
    join_parts([
        add_part("cyl", "p1", loc=(0, 0, 0), scale=(0.14, 0.14, 1.1), mat=m_wood),
        add_part("cone", "p2", loc=(0, 0, 1.15), rot=(math.pi, 0, 0), scale=(0.56, 0.56, 0.44), mat=m_red),
        add_part("torus", "p3", loc=(0, 0, 1.32), scale=(0.52, 0.52, 0.12), mat=m_red),
        add_part("cyl", "p4", loc=(0, 0, -1.05), scale=(0.22, 0.22, 0.14), mat=m_gold),
    ], "Item_PlungerBat")

    # 2. Glow-Stick Saber
    join_parts([
        add_part("cyl", "s1", loc=(0, 0, -0.8), scale=(0.14, 0.14, 0.46), mat=m_dark),
        add_part("torus", "s2", loc=(0, 0, -0.32), scale=(0.28, 0.28, 0.14), mat=m_chrome),
        add_part("cyl", "s3", loc=(0, 0, 0.78), scale=(0.16, 0.16, 1.2), mat=m_cyan),
    ], "Item_GlowSaber")

    # 3. Alarm-Omb
    join_parts([
        kay_prop("smokebomb","Clockwork shell",m_dark,(1.34,1.32,1.40)) or add_part("sphere", "b1", loc=(0, 0, 0), scale=(0.66, 0.66, 0.66), mat=m_dark),
        add_part("cyl", "b2", loc=(0, 0, 0.68), scale=(0.18, 0.18, 0.2), mat=m_chrome),
        add_part("sphere", "b3", loc=(0, 0, 0.96), scale=(0.18, 0.18, 0.18), mat=m_orange),
        add_part("cube", "b4", loc=(-0.26, 0, -0.68), scale=(0.2, 0.32, 0.12), mat=m_gold, bevel=0.03),
        add_part("cube", "b5", loc=(0.26, 0, -0.68), scale=(0.2, 0.32, 0.12), mat=m_gold, bevel=0.03),
        add_part("torus", "b6", loc=(0, -0.62, 0.1), rot=(math.pi / 2, 0, 0), scale=(0.30, 0.30, 0.26), mat=m_gold),
    ], "Item_AlarmOmb")

    # 4. Critter Capsule
    join_parts([
        add_part("sphere", "c1", loc=(0, 0, 0.05), scale=(0.56, 0.56, 0.56), mat=m_purple),
        add_part("sphere", "c2", loc=(0, 0, -0.05), scale=(0.55, 0.55, 0.55), mat=m_white),
        add_part("torus", "c3", loc=(0, 0, 0), scale=(0.57, 0.57, 0.22), mat=m_dark),
        add_part("sphere", "c4", loc=(0, 0.56, 0), scale=(0.20, 0.12, 0.20), mat=m_cyan),
    ], "Item_CritterCapsule")

    # 5. Shroom
    join_parts([
        add_part("cyl", "m1", loc=(0, 0, -0.35), scale=(0.34, 0.34, 0.44), mat=m_white),
        add_part("sphere", "m2", loc=(0, 0, 0.2), scale=(0.70, 0.70, 0.48), mat=m_red),
        add_part("sphere", "m3", loc=(0.36, 0.26, 0.36), scale=(0.18, 0.18, 0.18), mat=m_gold),
        add_part("sphere", "m4", loc=(-0.36, -0.22, 0.36), scale=(0.18, 0.18, 0.18), mat=m_gold),
    ], "Item_Shroom")

    # 6. Invinci-Star
    star_parts = [add_part("ico", "st0", loc=(0, 0, 0), scale=(0.48, 0.30, 0.48), mat=m_gold)]
    for i in range(5):
        a = i * (2 * math.pi / 5)
        star_parts.append(add_part("cone", f"st{i+1}", loc=(math.cos(a) * 0.56, 0, math.sin(a) * 0.56), rot=(0, math.pi / 2 - a, 0), scale=(0.24, 0.2, 0.50), mat=m_gold))
    join_parts(star_parts, "Item_InvinciStar")

    # 7. Prime Shipping Crate
    join_parts([
        add_part("cube", "cr1", loc=(0, 0, 0), scale=(0.76, 0.76, 0.76), mat=m_wood, bevel=0.05),
        add_part("cube", "cr2", loc=(0, 0, 0), scale=(0.82, 0.16, 0.82), mat=m_orange, bevel=0.02),
        add_part("cube", "cr3", loc=(0, 0, 0), scale=(0.16, 0.82, 0.82), mat=m_orange, bevel=0.02),
    ], "Item_Crate")

    # 8. Mallet of Chaos
    join_parts([
        add_part("cyl", "hm1", loc=(0, 0, -0.25), scale=(0.12, 0.12, 1.0), mat=m_wood),
        add_part("cyl", "hm2", loc=(0, 0, 0.7), rot=(0, math.pi / 2, 0), scale=(0.44, 0.44, 0.76), mat=m_dark),
        add_part("torus", "hm3", loc=(0, 0, 0.7), rot=(0, math.pi / 2, 0), scale=(0.46, 0.46, 0.16), mat=m_gold),
    ], "Item_Mallet")

    # 9. Barcode Ray Gun / Super Scope
    join_parts([
        add_part("cyl", "rg1", loc=(0.2, 0, 0.2), rot=(0, math.pi / 2, 0), scale=(0.22, 0.22, 0.74), mat=m_chrome),
        add_part("cube", "rg2", loc=(-0.25, 0, -0.25), rot=(0, 0.25, 0), scale=(0.18, 0.14, 0.40), mat=m_dark, bevel=0.03),
        add_part("sphere", "rg3", loc=(0.92, 0, 0.2), scale=(0.24, 0.24, 0.24), mat=m_cyan),
    ], "Item_RayGun")

    # 10. Tupperware Shell
    join_parts([
        add_part("sphere", "sh1", loc=(0, 0, 0.08), scale=(0.64, 0.64, 0.38), mat=m_green),
        add_part("torus", "sh2", loc=(0, 0, -0.05), scale=(0.58, 0.58, 0.20), mat=m_white),
    ], "Item_Shell")

    # 11. Roomba Mine / Speed Bump
    join_parts([
        add_part("cyl", "rm1", loc=(0, 0, 0), scale=(0.56, 0.56, 0.16), mat=m_dark),
        add_part("torus", "rm2", loc=(0, 0, 0.02), scale=(0.56, 0.56, 0.10), mat=m_chrome),
        add_part("sphere", "rm3", loc=(0, 0, 0.18), scale=(0.18, 0.18, 0.14), mat=m_red),
    ], "Item_RoombaMine")

    # 12. Spicy Bean Soup Bowl (Maxim Tomato)
    join_parts([
        kay_prop("mug_full","Soup mug",m_red,(1.55,1.14,1.02)) or add_part("sphere", "sp1", loc=(0, 0, -0.05), scale=(0.62, 0.62, 0.42), mat=m_red),
        add_part("cyl", "sp2", loc=(0, 0, 0.18), scale=(0.56, 0.56, 0.08), mat=m_orange),
        add_part("cyl", "sp3", loc=(0.28, 0, 0.46), rot=(0, 0.45, 0), scale=(0.07, 0.07, 0.45), mat=m_chrome),
    ], "Item_SpicySoup")

    # 12b. Discount First-Aid Kit (Heart Container)
    join_parts([
        add_part("cube", "fa1", loc=(0, 0, 0), scale=(0.62, 0.32, 0.48), mat=m_white, bevel=0.05),
        add_part("cube", "fa2", loc=(0, 0.34, 0), scale=(0.32, 0.04, 0.10), mat=m_red),
        add_part("cube", "fa3", loc=(0, 0.34, 0), scale=(0.10, 0.04, 0.32), mat=m_red),
        add_part("torus", "fa4", loc=(0, 0, 0.52), rot=(math.pi / 2, 0, 0), scale=(0.24, 0.18, 0.08), mat=m_red),
    ], "Item_FirstAid")

    # 12c. Cold Breakroom Pizza Slice (Food)
    join_parts([
        add_part("cone", "pz1", loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.58, 0.12, 0.72), mat=m_gold, verts=3, smooth=False),
        add_part("cyl", "pz2", loc=(0, -0.58, 0), rot=(0, math.pi / 2, 0), scale=(0.12, 0.12, 0.56), mat=m_wood),
        add_part("cyl", "pz3", loc=(0.12, -0.1, 0.12), scale=(0.14, 0.14, 0.05), mat=m_red),
        add_part("cyl", "pz4", loc=(-0.14, 0.15, 0.12), scale=(0.12, 0.12, 0.05), mat=m_red),
    ], "Item_ColdPizza")

    # 12d. Hot-Sauce Sprayer (Fire Flower)
    join_parts([
        add_part("cyl", "hs1", loc=(0, 0, -0.1), scale=(0.32, 0.32, 0.56), mat=m_orange),
        add_part("cone", "hs2", loc=(0, 0, 0.58), scale=(0.24, 0.24, 0.28), mat=m_green),
        add_part("cyl", "hs3", loc=(0, 0, -0.05), scale=(0.35, 0.35, 0.22), mat=m_gold),
    ], "Item_HotSauce")

    # 12e. Leaf-Blower Scope (Super Scope)
    join_parts([
        add_part("cyl", "lb1", loc=(0.25, 0, 0.15), rot=(0, math.pi / 2, 0), scale=(0.26, 0.26, 0.92), mat=m_green),
        add_part("sphere", "lb2", loc=(-0.45, 0, 0.15), scale=(0.42, 0.38, 0.42), mat=m_dark),
        add_part("torus", "lb3", loc=(1.15, 0, 0.15), rot=(0, math.pi / 2, 0), scale=(0.30, 0.30, 0.10), mat=m_gold),
    ], "Item_LeafBlower")

    # 12f. HOA Speed Bump (Bumper)
    join_parts([
        add_part("cyl", "sb_1", loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.68, 0.68, 0.24), mat=m_gold, verts=8, smooth=False),
        add_part("torus", "sb_2", loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), scale=(0.68, 0.68, 0.14), mat=m_dark),
        add_part("sphere", "sb_3", loc=(0, 0.24, 0), scale=(0.28, 0.16, 0.28), mat=m_red),
    ], "Item_SpeedBump")

    # 12g. Shrink Shroom (Poison Mushroom)
    join_parts([
        add_part("cyl", "ts1", loc=(0, 0, -0.35), scale=(0.30, 0.30, 0.40), mat=m_white),
        add_part("sphere", "ts2", loc=(0, 0, 0.2), scale=(0.64, 0.64, 0.44), mat=m_purple),
        add_part("sphere", "ts3", loc=(0.32, 0.24, 0.34), scale=(0.16, 0.16, 0.16), mat=m_cyan),
        add_part("sphere", "ts4", loc=(-0.32, -0.20, 0.34), scale=(0.16, 0.16, 0.16), mat=m_cyan),
    ], "Item_TinyShroom")

    # Legacy alias kept for safety
    join_parts([
        add_part("sphere", "fd1", loc=(0, 0, 0), scale=(0.58, 0.58, 0.48), mat=m_red),
        add_part("cone", "fd2", loc=(0, 0, 0.48), scale=(0.24, 0.24, 0.22), mat=m_green),
    ], "Item_HealFood")

    # Give the small summons a readable face and a second silhouette in profile.
    join_parts([
        add_part("sphere", "ld1", loc=(0, 0, 0), scale=(0.65, 0.55, 0.55), mat=m_gold),
        add_part("sphere", "ld2", loc=(0.45, 0, 0.48), scale=(0.42, 0.40, 0.40), mat=m_gold),
        add_part("cube", "ld3", loc=(0.86, 0, 0.42), scale=(0.30, 0.22, 0.10), mat=m_orange, bevel=0.03),
        add_part("cube", "ld4", loc=(0.68, 0, 0.56), scale=(0.14, 0.36, 0.12), mat=m_cyan),
        *[sweep("Duck wing",[(.16,s*.39,.12,.16,.15),(-.17,s*.50,.10,.18,.22),
                  (-.55,s*.54,.18,.14,.17),(-.74,s*.52,.27,.02,.02)],m_orange) for s in [-1,1]],
    ], "Summon_LaserDuck")

    join_parts([
        add_part("cube", "rt1", loc=(0, 0, 0), scale=(0.65, 0.48, 0.55), mat=m_chrome, bevel=0.08),
        add_part("cube", "rt2", loc=(0, 0, 0.62), scale=(0.42, 0.14, 0.26), mat=m_orange, bevel=0.03),
        add_part("sphere", "rt3", loc=(0.52, 0.22, 0.15), scale=(0.12, 0.12, 0.12), mat=m_red),
        add_part("sphere", "rt4", loc=(0.52, -0.22, 0.15), scale=(0.12, 0.12, 0.12), mat=m_red),
        *[add_part("sphere","Rubber foot",(x,y,-.55),scale=(.15,.12,.10),mat=m_dark)
          for x in [-.38,.38] for y in [-.31,.31]],
        add_part("cube","Lever handle",(0,-.54,.22),scale=(.19,.08,.045),mat=m_red,bevel=.24),
    ], "Summon_RagingToaster")

    join_parts([
        add_part("sphere", "ap1", loc=(0, 0, 0), scale=(0.75, 0.62, 0.62), mat=m_pink),
        add_part("cyl", "ap2", loc=(0.72, 0, -0.05), rot=(0, math.pi / 2, 0), scale=(0.24, 0.24, 0.18), mat=m_pink),
        add_part("cube", "ap3", loc=(0, 0, 0.64), scale=(0.26, 0.08, 0.12), mat=m_gold),
        *[add_part("cone","Pig ear",(.38,s*.34,.47),(s*.29,.18,0),(.14,.17,.24),m_pink) for s in [-1,1]],
        *[add_part("sphere","Eye",(.64,s*.31,.20),scale=(.07,.06,.08),mat=m_dark) for s in [-1,1]],
        *[add_part("sphere","Nostril",(.90,s*.095,-.02),scale=(.04,.038,.068),mat=m_dark) for s in [-1,1]],
    ], "Summon_AuditPiggy")

    join_parts([
        add_part("sphere", "ss1", loc=(0, 0, 0), scale=(0.82, 0.72, 0.85), mat=m_purple),
        add_part("cone", "ss2", loc=(-0.15, 0, 0.95), rot=(0, -0.4, 0), scale=(0.42, 0.42, 0.65), mat=m_cyan),
        add_part("sphere", "ss3", loc=(-0.45, 0, 1.38), scale=(0.18, 0.18, 0.18), mat=m_white),
        add_part("sphere","Face patch",(.60,0,.20),scale=(.28,.55,.39),mat=m_white),
        *[add_part("sphere","Eye patch",(.77,s*.26,.26),(s*.25,0,0),(.11,.23,.10),m_wood) for s in [-1,1]],
        add_part("sphere","Nose",(.88,0,.09),scale=(.095,.13,.075),mat=m_dark),
    ], "Summon_SnoreSloth")

    join_parts([
        add_part("cone", "tp1", loc=(0, 0, 0), rot=(math.pi, 0, 0), scale=(0.68, 0.68, 1.1), mat=m_cyan),
        add_part("sphere", "tp2", loc=(0, 0, 0.72), scale=(0.46, 0.42, 0.42), mat=m_gold),
        add_part("cone", "tp3", loc=(0.56, 0, 0.70), rot=(0, math.pi / 2, 0), scale=(0.16, 0.16, 0.32), mat=m_orange),
        *[sweep("Gusting wing",[(.06,s*.24,.56,.16,.21),(-.22,s*.53,.63,.28,.20),
                  (-.56,s*.78,.85,.27,.18),(-.80,s*.98,1.18,.02,.03)],m_purple) for s in [-1,1]],
        *[add_part("sphere","Eye",(.32,s*.25,.83),scale=(.067,.066,.08),mat=m_dark) for s in [-1,1]],
    ], "Summon_TornadoPigeon")

    join_parts([
        add_part("sphere", "vh1", loc=(0, 0, 0), scale=(0.62, 0.58, 0.62), mat=m_gold),
        add_part("cone", "vh2", loc=(0, 0.42, 0.78), rot=(0.3, 0, 0), scale=(0.18, 0.18, 0.52), mat=m_gold),
        add_part("cone", "vh3", loc=(0, -0.42, 0.78), rot=(-0.3, 0, 0), scale=(0.18, 0.18, 0.52), mat=m_gold),
        add_part("torus", "vh4", loc=(0, 0, 0), scale=(0.82, 0.82, 0.10), mat=m_cyan),
        *[add_part("sphere","Electric cheek",(.45,s*.30,-.04),scale=(.22,.20,.14),mat=m_orange) for s in [-1,1]],
        *[add_part("sphere","Eye",(.50,s*.24,.19),scale=(.075,.066,.09),mat=m_dark) for s in [-1,1]],
    ], "Summon_VoltHamster")

    ribs, paper = [], []
    for i in range(13):
        a = (i-6)*.14
        x, z = math.sin(a), math.cos(a)
        ribs.append(add_part("cyl","Bamboo rib",(.61*x,0,.61*z-.67),(0,a,0),(.023,.023,.64),m_wood))
        for radius in (.46,1.27):
            paper.append((radius*x, .055 if i%2 else -.055, radius*z-.67))
    sheet = mesh_object("Pleated paper", paper, [(2*i,2*i+1,2*i+3,2*i+2) for i in range(12)],m_white)
    sheet.data.materials.append(m_pink)
    for face in sheet.data.polygons:
        face.material_index = int(face.index % 3 == 0)
    ribs += [sheet, add_part("sphere","Fan pin",(0,-.06,-.62),scale=(.085,.05,.085),mat=m_gold)]
    join_parts(ribs, "Item_PaperFan")

    wand = kay_prop("wand","Lacquer wand",m_pink,(.24,.24,1.84),(0,0,-.20))
    wand = wand or add_part("cyl","Wand grip",(0,0,-.20),scale=(.085,.085,.92),mat=m_pink)
    star = []
    for i in range(10):
        a = i * math.pi / 5
        r = .52 if i%2==0 else .235
        star.append((r*math.sin(a),0,.91+r*math.cos(a)))
    star += [(0,-.16,.91),(0,.16,.91)]
    faces = [(10,(i+1)%10,i) for i in range(10)] + [(11,i,(i+1)%10) for i in range(10)]
    jewel = mesh_object("Wish star",star,faces,m_gold)
    join_parts([wand,jewel,add_part("torus","Ferrule",(0,0,.49),scale=(.16,.16,.18),mat=m_chrome)],"Item_StarWand")

    join_parts([add_part("cube","Tin",(0,0,-.12),scale=(.68,.41,.44),mat=m_chrome,bevel=.17),
        add_part("cube","Lid",(0,0,.30),scale=(.70,.43,.13),mat=m_chrome,bevel=.19),
        add_part("torus","Bail",(0,0,.50),(math.pi/2,0,0),(.29,.17,.11),m_dark),
        add_part("cube","Clasp",(0,-.43,.18),scale=(.11,.035,.10),mat=m_gold,bevel=.13)],"Item_MetalBox")

    ears = [add_part("torus","Headband",scale=(.56,.45,.26),mat=m_pink,min=.13)]
    for s in (-1,1):
        ears += [add_part("sphere","Ear",(s*.36,0,.55),(0,s*.17,0),(.22,.16,.65),m_white),
                 add_part("sphere","Velvet lining",(s*.36,-.135,.58),(0,s*.17,0),(.13,.045,.47),m_pink)]
    join_parts(ears,"Item_BunnyEars")

    ice = make_mat("Ice glaze",(.33,.84,1,1),roughness=.16,emission=(.10,.55,.95,1),emission_strength=.38)
    ice.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = .47
    join_parts([add_part("cube","Cut ice",scale=(.70,.62,.70),mat=ice,bevel=.30,smooth=False),
        add_part("ico","Frost heart",scale=(.29,.25,.42),mat=m_cyan,sub=1,smooth=False)],"Item_Freezie")

    def oval(name, xyz, size, paint, tilt=0):
        return add_part("sphere",name,xyz,(0,tilt,0),size,paint)
    potato = [oval("Velour body",(0,0,0),(.53,.41,.53),m_wood),
              oval("Potato nose",(.10,-.40,-.02),(.26,.23,.24),m_orange)]
    penguin = [oval("Penguin", (0,0,0),(.52,.42,.76),m_dark),
               oval("Snow bib",(0,-.29,-.04),(.40,.18,.55),m_white),
               oval("Beak",(0,-.46,.23),(.16,.18,.08),m_orange)]
    cat = [oval("Cosmic loaf",(0,0,-.15),(.69,.43,.40),m_purple),
           oval("Face",(0,-.20,.14),(.46,.33,.40),m_purple),
           add_part("torus","Orbit",(0,0,-.17),(.24,-.21,0),(.90,.68,.25),m_cyan,min=.045)]
    for s in (-1,1):
        potato += [oval("Slipper",(s*.29,-.12,-.47),(.23,.27,.13),m_red),
                   oval("Eye",(s*.18,-.36,.14),(.045,.042,.083),m_dark),
                   oval("Bow",(s*.145,.02,.54),(.17,.09,.10),m_pink,s*-.45)]
        for j in range(2):
            potato.append(oval("Whisker",(s*.39,-.32,-.07+j*.10),(.20,.018,.020),m_dark,s*(.15-j*.25)))
        penguin += [oval("Flipper",(s*.46,0,-.09),(.14,.23,.43),m_dark,s*-.23),
                    oval("Eye",(s*.17,-.365,.32),(.057,.05,.075),m_dark),
                    oval("Foot",(s*.24,-.12,-.69),(.21,.29,.09),m_cyan)]
        cat += [add_part("cone","Cat ear",(s*.30,-.18,.48),(0,s*.20,0),(.16,.15,.24),m_purple),
                oval("Starlit eye",(s*.19,-.50,.17),(.075,.03,.05),m_cyan)]
    for parts,name in [(potato,"Item_PotatoPlush"),(penguin,"Summon_ChillPenguin"),(cat,"Summon_GravityCat")]:
        join_parts(parts,name)

    export_glb("items.glb")


def build_stage_props_pack():
    """Dramatic multi-part 3D architectural stage centerpieces (12 themes)."""
    clear_scene()
    m_stone = make_mat("Stone", (0.52, 0.58, 0.72, 1), roughness=0.72)
    m_crystal = make_mat("Crystal", (0.30, 0.90, 1.0, 1), metallic=0.25, roughness=0.14, emission=(0.25, 0.75, 1.0, 1), emission_strength=1.4)
    m_pink = make_mat("NeonPink", (1.0, 0.30, 0.74, 1), metallic=0.2, roughness=0.18, emission=(1.0, 0.25, 0.68, 1), emission_strength=1.5)
    m_bark = make_mat("Bark", (0.46, 0.30, 0.18, 1), roughness=0.82)
    m_leaf = make_mat("Leaf", (0.28, 0.80, 0.34, 1), roughness=0.55)
    m_steel = make_mat("Steel", (0.66, 0.72, 0.82, 1), metallic=0.85, roughness=0.24)
    m_gold = make_mat("GoldTrim", (1.0, 0.80, 0.24, 1), metallic=0.75, roughness=0.22)
    m_acid = make_mat("Acid", (0.45, 1.0, 0.25, 1), roughness=0.2, emission=(0.45, 1.0, 0.25, 1), emission_strength=1.5)
    m_roof = make_mat("RoofRed", (0.90, 0.20, 0.28, 1), roughness=0.42)
    m_glass = make_mat("TowerGlass", (0.16, 0.32, 0.60, 1), metallic=0.78, roughness=0.16)
    m_balloon = make_mat("Balloon", (0.98, 0.56, 0.84, 1), roughness=0.3, emission=(0.5, 0.15, 0.35, 1), emission_strength=0.3)
    m_pipe_g = make_mat("WarpPipe", (0.16, 0.80, 0.34, 1), metallic=0.35, roughness=0.28)
    m_ice = make_mat("IceSpire", (0.65, 0.94, 1.0, 1), metallic=0.2, roughness=0.12, emission=(0.3, 0.72, 1.0, 1), emission_strength=0.45)

    # 1. Ruin Pillar Archway
    join_parts([
        add_part("cube", "rp1", loc=(0, 0, -1.8), scale=(1.05, 1.05, 0.35), mat=m_stone, bevel=0.06),
        add_part("cyl", "rp2", loc=(0, 0, 0), scale=(0.68, 0.68, 1.65), mat=m_stone, verts=12),
        add_part("cube", "rp3", loc=(0, 0, 1.75), scale=(1.1, 1.1, 0.32), mat=m_stone, bevel=0.06),
        add_part("torus", "rp4", loc=(0, 0, 1.35), scale=(0.76, 0.76, 0.14), mat=m_crystal),
        add_part("torus", "rp5", loc=(0, 0, -1.25), scale=(0.76, 0.76, 0.14), mat=m_gold),
        *[add_part("cyl","Stone flute",(.65*math.cos(i*math.tau/12),.65*math.sin(i*math.tau/12),0),
                  scale=(.092,.092,1.23),mat=m_stone,verts=10,bevel=.05) for i in range(12)],
    ], "Prop_RuinPillar")

    # 2. Cosmic Crystal Monolith with Gyro Rings
    join_parts([
        add_part("cone", "cc1", loc=(0, 0, 1.15), scale=(0.78, 0.78, 1.45), mat=m_pink, verts=6, smooth=False),
        add_part("cone", "cc2", loc=(0, 0, -1.15), rot=(math.pi, 0, 0), scale=(0.78, 0.78, 1.45), mat=m_crystal, verts=6, smooth=False),
        add_part("torus", "cc3", loc=(0, 0, 0), rot=(0.4, 0.3, 0), scale=(1.35, 1.35, 0.10), mat=m_gold),
        add_part("torus", "cc4", loc=(0, 0, 0), rot=(-0.5, 0.7, 0.4), scale=(1.65, 1.65, 0.08), mat=m_crystal),
    ], "Prop_CosmicCrystal")

    # 3. Stylized Bizarro Tree
    join_parts([
        add_part("cyl", "tr1", loc=(0, 0, -0.7), scale=(0.58, 0.58, 1.25), mat=m_bark, verts=10),
        add_part("ico", "tr2", loc=(0, 0, 0.95), scale=(1.5, 1.5, 1.2), mat=m_leaf, sub=2),
        add_part("ico", "tr3", loc=(0.85, 0.2, 0.55), scale=(1.0, 1.0, 0.85), mat=m_leaf, sub=2),
        add_part("ico", "tr4", loc=(-0.85, -0.2, 0.6), scale=(1.0, 1.0, 0.85), mat=m_leaf, sub=2),
    ], "Prop_Tree")

    # 4. Stadium Floodlight Tower
    join_parts([
        add_part("cyl", "fl1", loc=(0, 0, 0), scale=(0.24, 0.24, 2.05), mat=m_steel, verts=10),
        add_part("cube", "fl2", loc=(0, 0.2, 2.0), scale=(1.15, 0.32, 0.58), mat=m_steel, bevel=0.05),
        add_part("cube", "fl3", loc=(0, 0.48, 2.0), scale=(0.98, 0.10, 0.42), mat=m_crystal),
    ], "Prop_Floodlight")

    # 5. Starship Engine Pod
    join_parts([
        add_part("cyl", "sp1", loc=(0, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.68, 0.68, 1.65), mat=m_steel, verts=16),
        add_part("cone", "sp2", loc=(1.85, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.68, 0.68, 0.92), mat=m_steel, verts=16),
        add_part("cyl", "sp3", loc=(-1.7, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.56, 0.56, 0.20), mat=m_crystal, verts=16),
        add_part("torus", "sp4", loc=(0.2, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.74, 0.74, 0.12), mat=m_gold),
    ], "Prop_StarshipPod")

    # 6. Acid Refinery Pipe
    join_parts([
        add_part("cyl", "ap1", loc=(0, 0, 0), scale=(0.58, 0.58, 1.45), mat=m_steel, verts=12),
        add_part("torus", "ap2", loc=(0, 0, 1.3), scale=(0.68, 0.68, 0.18), mat=m_steel),
        add_part("sphere", "ap3", loc=(0, 0, 1.55), scale=(0.48, 0.48, 0.48), mat=m_acid),
    ], "Prop_AcidPipe")

    # 7. Castle Turret
    join_parts([
        add_part("cyl", "ct1", loc=(0, 0, 0), scale=(0.78, 0.78, 1.65), mat=m_stone, verts=14),
        add_part("cone", "ct2", loc=(0, 0, 2.25), scale=(1.02, 1.02, 1.15), mat=m_roof, verts=14),
        add_part("torus", "ct3", loc=(0, 0, 1.48), scale=(0.84, 0.84, 0.16), mat=m_gold),
    ], "Prop_CastleTurret")

    # 8. Skyscraper Tower
    join_parts([
        add_part("cube", "sk1", loc=(0, 0, 0), scale=(0.92, 0.92, 2.45), mat=m_glass, bevel=0.05),
        add_part("cube", "sk2", loc=(0, 0, 2.6), scale=(0.66, 0.66, 0.36), mat=m_steel, bevel=0.04),
        add_part("cyl", "sk3", loc=(0, 0, 3.25), scale=(0.07, 0.07, 0.78), mat=m_pink, verts=8),
    ], "Prop_Skyscraper")

    # 9. Parade Balloon
    join_parts([
        add_part("sphere", "pb1", loc=(0, 0, 0.4), scale=(1.15, 1.0, 1.15), mat=m_balloon),
        add_part("cone", "pb2", loc=(-0.56, 0, 1.48), rot=(0, -0.35, 0), scale=(0.30, 0.30, 0.56), mat=m_balloon),
        add_part("cone", "pb3", loc=(0.56, 0, 1.48), rot=(0, 0.35, 0), scale=(0.30, 0.30, 0.56), mat=m_balloon),
        add_part("cube", "pb4", loc=(0, 0, -1.02), scale=(0.38, 0.38, 0.26), mat=m_gold, bevel=0.04),
    ], "Prop_Balloon")

    # 10. Giant Warp Pipe
    join_parts([
        add_part("cyl", "wp1", loc=(0, 0, -0.2), scale=(0.68, 0.68, 1.45), mat=m_pipe_g, verts=16),
        add_part("cyl", "wp2", loc=(0, 0, 1.25), scale=(0.84, 0.84, 0.34), mat=m_pipe_g, verts=16),
        add_part("torus", "wp3", loc=(0, 0, 1.42), scale=(0.80, 0.80, 0.10), mat=m_pipe_g),
    ], "Prop_WarpPipe")

    # 11. Neon Highway Arch
    join_parts([
        add_part("cube", "na1", loc=(-1.35, 0, 0), scale=(0.22, 0.26, 1.85), mat=m_steel, bevel=0.03),
        add_part("cube", "na2", loc=(1.35, 0, 0), scale=(0.22, 0.26, 1.85), mat=m_steel, bevel=0.03),
        add_part("cube", "na3", loc=(0, 0, 1.78), scale=(1.58, 0.28, 0.24), mat=m_pink, bevel=0.04),
        add_part("cube", "na4", loc=(0, 0, 1.42), scale=(1.48, 0.16, 0.14), mat=m_crystal),
    ], "Prop_NeonArch")

    # 12. Glacier Ice Spire
    join_parts([
        add_part("cone", "is1", loc=(0, 0, 0.4), scale=(0.88, 0.88, 2.25), mat=m_ice, verts=6, smooth=False),
        add_part("cone", "is2", loc=(0.72, 0, -0.3), rot=(0, 0.25, 0), scale=(0.52, 0.52, 1.35), mat=m_ice, verts=6, smooth=False),
        add_part("cone", "is3", loc=(-0.68, 0, -0.4), rot=(0, -0.28, 0), scale=(0.48, 0.48, 1.25), mat=m_ice, verts=6, smooth=False),
    ], "Prop_IceSpire")

    # 13. Ornate 3-Tier Crystal Fountain (Puddle of Insomnia)
    join_parts([
        add_part("cyl", "ft1", loc=(0, 0, -0.7), scale=(1.55, 1.55, 0.28), mat=m_stone, verts=16),
        add_part("cyl", "ft2", loc=(0, 0, 0.2), scale=(0.42, 0.42, 0.95), mat=m_stone, verts=12),
        add_part("cyl", "ft3", loc=(0, 0, 0.85), scale=(0.95, 0.95, 0.18), mat=m_crystal, verts=16),
        add_part("cone", "ft4", loc=(0, 0, 1.65), scale=(0.45, 0.45, 0.9), mat=m_crystal, verts=12),
    ], "Prop_Fountain")

    # 14. Stadium Jumbotron Screen (Critter Arena)
    join_parts([
        add_part("cube", "jb1", loc=(0, 0, 0.42), scale=(1.65, 0.28, 0.62), mat=m_steel, bevel=0.04),
        add_part("cube", "jb2", loc=(0, 0.30, 0.42), scale=(1.42, 0.04, 0.48), mat=m_crystal),
        add_part("cyl", "jb3", loc=(-1.05, 0, -0.55), scale=(0.14, 0.14, 0.85), mat=m_steel),
        add_part("cyl", "jb4", loc=(1.05, 0, -0.55), scale=(0.14, 0.14, 0.85), mat=m_steel),
    ], "Prop_Jumbotron")

    # 15. Sculpted Pizza Delivery Van Hazard (Onett / Big Blue)
    join_parts([
        add_part("cube", "pv1", loc=(0, 0, 0.15), scale=(1.45, 0.72, 0.62), mat=m_roof, bevel=0.08),
        add_part("cube", "pv2", loc=(0.55, 0, 0.45), scale=(0.55, 0.66, 0.35), mat=m_glass, bevel=0.04),
        add_part("cone", "pv3", loc=(-0.15, 0, 0.95), scale=(0.45, 0.35, 0.24), mat=m_gold, verts=3, smooth=False),
        add_part("cyl", "pv4", loc=(-0.82, 0.68, -0.45), rot=(math.pi / 2, 0, 0), scale=(0.32, 0.32, 0.16), mat=m_steel),
        add_part("cyl", "pv5", loc=(0.82, 0.68, -0.45), rot=(math.pi / 2, 0, 0), scale=(0.32, 0.32, 0.16), mat=m_steel),
    ], "Hazard_PizzaVan")

    # 16. Sculpted HOA Fine Rocket Hazard (Foreclosed Castle / Corporate Kingdom II)
    join_parts([
        add_part("cyl", "fr1", loc=(0, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.52, 0.52, 1.25), mat=m_steel, verts=14),
        add_part("cone", "fr2", loc=(1.55, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.52, 0.52, 0.65), mat=m_roof, verts=14),
        add_part("cone", "fr3", loc=(-1.45, 0, 0), rot=(0, -math.pi / 2, 0), scale=(0.42, 0.42, 0.55), mat=m_gold, verts=10),
    ], "Hazard_FineRocket")

    # 17. Floating rune ring (Arguefield / Final Obligation)
    join_parts([
        add_part("torus", "rr1", loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), scale=(1.35, 1.35, 0.12), mat=m_crystal),
        add_part("torus", "rr2", loc=(0, 0, 0), rot=(math.pi / 2, 0.4, 0), scale=(0.85, 0.85, 0.08), mat=m_gold),
        add_part("cone", "rr3", loc=(0, 1.15, 0), scale=(0.16, 0.16, 0.28), mat=m_crystal),
        add_part("cone", "rr4", loc=(0, -1.15, 0), rot=(math.pi, 0, 0), scale=(0.16, 0.16, 0.28), mat=m_crystal),
    ], "Prop_RuneRing")

    # 18. Patchwork craft cloud (Scandall's Tax Shelter)
    join_parts([
        add_part("sphere", "cc_a", loc=(0, 0, 0.15), scale=(0.85, 0.55, 0.42), mat=m_balloon),
        add_part("sphere", "cc_b", loc=(0.7, 0.15, 0.05), scale=(0.55, 0.42, 0.36), mat=m_balloon),
        add_part("sphere", "cc_c", loc=(-0.65, -0.1, 0.02), scale=(0.48, 0.38, 0.32), mat=m_balloon),
        *[add_part("sphere","Gold stitch",(i*.14,-.53,.13+.028*(i%2)),rot=(0,-.32,0),scale=(.050,.023,.016),mat=m_gold) for i in range(-4,5)],
    ], "Prop_CraftCloud")

    # 19. Cave torch
    join_parts([
        add_part("cyl", "to1", loc=(0, 0, -0.4), scale=(0.08, 0.08, 0.7), mat=m_bark),
        add_part("cone", "to2", loc=(0, 0, 0.45), scale=(0.22, 0.22, 0.45), mat=m_gold),
        add_part("cone", "to3", loc=(0, 0, 0.62), scale=(0.12, 0.12, 0.32), mat=m_crystal),
    ], "Prop_Torch")

    # 20. Arwing-style starfighter
    join_parts([
        add_part("cone", "aw1", loc=(0.85, 0, 0), rot=(0, math.pi / 2, 0), scale=(0.28, 0.18, 0.7), mat=m_steel),
        add_part("cube", "aw2", loc=(0, 0, 0), scale=(0.55, 0.22, 0.16), mat=m_steel, bevel=0.03),
        add_part("cone", "aw3", loc=(0.1, 0.85, 0), rot=(0, 0, math.pi / 2), scale=(0.10, 0.28, 0.7), mat=m_glass),
        add_part("cone", "aw4", loc=(0.1, -0.85, 0), rot=(0, 0, -math.pi / 2), scale=(0.10, 0.28, 0.7), mat=m_glass),
        add_part("cone", "aw5", loc=(-0.7, 0, 0), rot=(0, -math.pi / 2, 0), scale=(0.18, 0.16, 0.35), mat=m_crystal),
    ], "Prop_Arwing")

    # Keep the painted bark/leaf colors from the low-poly OBJ. The MegaKit rock
    # uses our limestone material so no external texture atlas is required.
    tree = PACKS/"nature2/OBJ/CommonTree_2.obj"
    if tree.is_file():
        bpy.ops.wm.obj_import(filepath=str(tree))
        imported = list(bpy.context.selected_objects)
        tree_obj = join_parts(imported,"Canopy")
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        old = bpy.data.objects["Prop_Tree"]
        bpy.data.objects.remove(old, do_unlink=True)
        tree_obj.name = "Prop_Tree"
        fit(polish(tree_obj,.52),(3.5,3.1,4.2),(0,0,.2))
        print("Source:",tree.name,"-> Prop_Tree")
    if not source_part(NATURE/"Rock_Medium_1.gltf","Prop_MossRock",m_bark,(2.8,2.1,1.52)):
        polish(add_part("ico","Prop_MossRock",scale=(1.4,1.05,.76),mat=m_bark),subdiv=1)
    bars = [add_part("cube","Catwalk rail",(0,0,z),scale=(1.6,.13,.045),mat=m_steel,bevel=.12)
            for z in (-.30,.30)]
    for i in range(8):
        bars.append(add_part("cube","Diagonal brace",(-1.40+i*.40,0,0),(0,(-1)**i*.57,0),
                             (.035,.08,.36),m_steel,bevel=.08))
    join_parts(bars,"Prop_Catwalk")
    export_glb("stage-props.glb")


if __name__ == "__main__":
    build_characters_pack()
    build_weapons_pack()
    build_items_pack()
    build_stage_props_pack()
    print("All 4 AAA Blender 3D GLB packs built successfully!")

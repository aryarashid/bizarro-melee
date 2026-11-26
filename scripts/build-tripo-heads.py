#!/usr/bin/env python3
"""
Compile, orient, optimize, and pack Tripo Image-to-3D character head/creature
GLBs from /tmp/bizarro-tripo/glbs/ into web/assets/models/tripo-heads.glb.

Run via:
  /opt/homebrew/bin/blender --background --python scripts/build-tripo-heads.py
"""
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path(os.environ.get("TRIPO_GLB_DIR", "/tmp/bizarro-tripo/glbs"))
OUT_GLB = ROOT / "web/assets/models/tripo-heads.glb"
PREVIEW_IMG = Path("/tmp/bizarro-tripo/tripo_heads_sheet.png")

# Tripo outputs are already aligned to +X (right) in Blender space except falcont
# whose cutout faced +Y; rotating falcont -90 deg around Z aligns its beak to +X.
YAW_DEG = {
    "falcont": -90,
}

# Optional normalized Z-slice cutoff (0..1 from bottom of mesh) to trim lower shoulders/bust
TRIM_BOTTOM_FRAC = {
    "faux": 0.24,
    "captain-pigeon": 0.14,
    "dr-bario": 0.10,
    "bario": 0.08,
    "dadondorf": 0.12,
    "shamus": 0.18,
    "velda": 0.14,
    "garth": 0.14,
    "troy": 0.12,
    "shriek": 0.14,
    "slush-shovelers": 0.14,
    "wonky-kong": 0.14,
    "mess": 0.12,
    "zink": 0.12,
    "tiny-zink": 0.12,
    "screech": 0.12,
    "squeegi": 0.08,
    "sourzer": 0.12,
    "falcont": 0.14,
    "broshee": 0.12,
}

TARGET_FACES = 1800
TEX_SIZE = 256


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def process_one(fid: str, glb_path: Path):
    before_objs = set(bpy.data.objects)
    before_imgs = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    new_objs = [o for o in bpy.data.objects if o not in before_objs]
    meshes = [o for o in new_objs if o.type == "MESH"]
    if not meshes:
        return None

    # Remove non-mesh helpers after baking world matrices
    for m in meshes:
        m.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for o in new_objs:
        if o != obj and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

    # Apply existing transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Rotate around Z so face points +X (right) — switch from QUATERNION to XYZ first!
    yaw = math.radians(YAW_DEG.get(fid, 0))
    if yaw:
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = Euler((0.0, 0.0, yaw), "XYZ")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Trim lower bust/shoulders cleanly if requested
    trim_frac = TRIM_BOTTOM_FRAC.get(fid, 0.0)
    if trim_frac > 0.0:
        zs = [v.co.z for v in obj.data.vertices]
        z_min, z_max = min(zs), max(zs)
        cut_z = z_min + (z_max - z_min) * trim_frac
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=Vector((0.0, 0.0, cut_z)),
            plane_no=Vector((0.0, 0.0, 1.0)),
            clear_inner=True,
        )
        boundary = [e for e in bm.edges if e.is_boundary]
        if boundary:
            bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
        bm.to_mesh(obj.data)
        bm.free()

    # Remove tiny stray floating shards (< 6% of largest mesh island)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    visited = set()
    islands = []
    for v in bm.verts:
        if v.index in visited:
            continue
        stack = [v]
        comp = []
        visited.add(v.index)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                nb = e.other_vert(cur)
                if nb.index not in visited:
                    visited.add(nb.index)
                    stack.append(nb)
        islands.append(comp)
    if len(islands) > 1:
        max_len = max(len(c) for c in islands)
        drop = [v for c in islands if len(c) < max_len * 0.08 for v in c]
        if drop:
            bmesh.ops.delete(bm, geom=drop, context="VERTS")
            bm.to_mesh(obj.data)
    bm.free()

    # Decimate smoothly to TARGET_FACES
    cur_faces = len(obj.data.polygons)
    if cur_faces > TARGET_FACES:
        mod = obj.modifiers.new("Decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(0.18, min(1.0, TARGET_FACES / float(cur_faces)))
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Normalize center and scale to unit radius (~1.0 half-extent in Y/Z)
    verts = [v.co for v in obj.data.vertices]
    mn = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    mx = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    center = (mn + mx) * 0.5
    ext = (mx - mn) * 0.5
    max_e = max(ext.x, ext.y, ext.z, 1e-5)
    # Use balanced scale so tall hats/ears don't make faces tiny
    scale_ref = (ext.x * 0.40 + ext.y * 0.35 + ext.z * 0.25) * 1.15
    scale_ref = max(scale_ref, max_e * 0.62)
    inv = 1.0 / scale_ref
    for v in obj.data.vertices:
        v.co = (v.co - center) * inv
    obj.data.update()

    # Smooth shading
    for p in obj.data.polygons:
        p.use_smooth = True

    # Downscale embedded textures to TEX_SIZE x TEX_SIZE and tune material
    new_imgs = [im for im in bpy.data.images if im not in before_imgs]
    for im in new_imgs:
        im.name = f"Tex_Tripo_{fid}"
        if im.size[0] > TEX_SIZE or im.size[1] > TEX_SIZE:
            im.scale(TEX_SIZE, TEX_SIZE)
        im.pack()

    for mat in obj.data.materials:
        if not mat:
            continue
        mat.name = f"Mat_Tripo_{fid}"
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Roughness"].default_value = 0.68
                    node.inputs["Metallic"].default_value = 0.04
                    # Remove normal/roughness links if any bloat exists, keep Base Color crisp
                    for inp_name in ("Roughness", "Metallic", "Normal"):
                        if inp_name in node.inputs:
                            for lnk in list(node.inputs[inp_name].links):
                                mat.node_tree.links.remove(lnk)

    obj.name = f"Tripo_{fid}"
    obj.data.name = f"Mesh_Tripo_{fid}"
    return obj


def render_contact_sheet(objs):
    """Render all processed heads arranged in a 5x5 grid facing +X (right) as seen in gameplay."""
    cols, rows = 5, 5
    spacing = 2.65
    saved_locs = {}
    for idx, obj in enumerate(objs):
        saved_locs[obj.name] = obj.location.copy()
        c = idx % cols
        r = idx // cols
        x = (c - (cols - 1) * 0.5) * spacing
        z = ((rows - 1) * 0.5 - r) * spacing
        obj.location = Vector((x, 0.0, z))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1280
    scene.world = bpy.data.worlds.new("AuditWorld")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.09, 0.13, 0.22, 1.0)

    cam_data = bpy.data.cameras.new("AuditCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = spacing * cols + 1.2
    cam = bpy.data.objects.new("AuditCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Camera looks from -Y toward +Y (slightly angled +20 deg so we see 3/4 gameplay angle!)
    cam.location = Vector((2.5, -18.0, 0.5))
    cam.rotation_euler = Euler((math.radians(90), 0.0, math.radians(8)), "XYZ")

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 3.2
    sun = bpy.data.objects.new("Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = Euler((math.radians(55), 0.0, math.radians(25)), "XYZ")

    fill_data = bpy.data.lights.new("Fill", "SUN")
    fill_data.energy = 1.4
    fill = bpy.data.objects.new("Fill", fill_data)
    scene.collection.objects.link(fill)
    fill.rotation_euler = Euler((math.radians(100), 0.0, math.radians(-40)), "XYZ")

    PREVIEW_IMG.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(PREVIEW_IMG)
    bpy.ops.render.render(write_still=True)

    # Clean up camera/lights and restore origins for export
    for tmp in (cam, sun, fill):
        bpy.data.objects.remove(tmp, do_unlink=True)
    for obj in objs:
        obj.location = saved_locs[obj.name]


def main():
    if not SRC_DIR.exists():
        raise SystemExit(f"Missing Tripo GLB directory: {SRC_DIR}")
    glbs = sorted(SRC_DIR.glob("*.glb"))
    if not glbs:
        raise SystemExit(f"No .glb files found in {SRC_DIR}")

    clear_scene()
    built = []
    for glb in glbs:
        fid = glb.stem
        obj = process_one(fid, glb)
        if obj:
            built.append(obj)
            print(f"PACKED {obj.name}: faces={len(obj.data.polygons)}")

    render_contact_sheet(built)

    # Export all heads at origin into one self-contained GLB with JPEG textures!
    bpy.ops.object.select_all(action="DESELECT")
    for obj in built:
        obj.select_set(True)

    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_image_format="JPEG",
        export_image_quality=80,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    print(f"EXPORTED {OUT_GLB}: {OUT_GLB.stat().st_size} bytes ({len(built)} Tripo heads)")


if __name__ == "__main__":
    main()

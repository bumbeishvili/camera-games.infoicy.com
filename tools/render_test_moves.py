"""Renders footage of moves the free clips don't show: claps, hands going round in circles, arms out
as wings, and the routines filmed for the previews on the page for choosing a game.

A rigged person, facing the camera, does exactly what's listed below. The tests then put the
picture through the real pose tracker, so the only thing made up is the person.

Usage: Blender -b --factory-startup -P tools/render_test_moves.py -- <clip> <frames folder> [first] [last]
"""
import math
import os
import random
import shutil
import sys
import tempfile

import bpy
from mathutils import Euler, Vector

args = sys.argv[sys.argv.index("--") + 1:]
CLIP, OUT = args[0], args[1]
FIRST = int(args[2]) if len(args) > 2 else None
LAST = int(args[3]) if len(args) > 3 else None
# The free rigged people from vrm-samples, which aren't kept in this repo: see CREDITS.md.
MODELS = os.environ.get("VRM_MODELS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_prompts", "short-audio-film", "build", "models"))
MODEL = "Vita"  # Marked CC0 in its own metadata.
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.film_transparent = False
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92
scene.eevee.taa_render_samples = 8
scene.view_settings.view_transform = "Standard"

world = bpy.data.worlds.new("room")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.84, 0.88, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
scene.world = world


def plain(name, colour):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*colour, 1)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
    return material


bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
bpy.context.object.data.materials.append(plain("floor", (0.55, 0.47, 0.38)))
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, -1.6, 5), rotation=(math.pi / 2, 0, 0))
bpy.context.object.data.materials.append(plain("wall", (0.78, 0.8, 0.74)))

sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 2.4
sun_object = bpy.data.objects.new("sun", sun)
sun_object.rotation_euler = (math.radians(55), 0, math.radians(20))
scene.collection.objects.link(sun_object)

camera = bpy.data.cameras.new("camera")
camera.lens = 30
camera_object = bpy.data.objects.new("camera", camera)
camera_object.location = (0, 3.2, 0.92)
camera_object.rotation_euler = (math.radians(90), 0, math.radians(180))
scene.collection.objects.link(camera_object)
scene.camera = camera_object

folder = tempfile.mkdtemp()
glb = os.path.join(folder, MODEL + ".glb")
shutil.copy(os.path.join(MODELS, MODEL + ".vrm"), glb)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=glb)
new = [o for o in bpy.data.objects if o not in before]
for o in new:
    if o.type == "MESH" and o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bones = arm.pose.bones
rest_q = {}
for bone in bones:
    bone.rotation_mode = "QUATERNION"
    rest_q[bone.name] = bone.bone.matrix_local.to_quaternion()
rest = {n: bones[n].bone.head_local.copy() for n in bones.keys()}


def set_rel(name, q):
    """q is a rotation about the rest-pose axes."""
    if name in bones:
        bones[name].rotation_quaternion = rest_q[name].inverted() @ q @ rest_q[name]


def solve_arm(sid, side, target):
    n1, n2, n3 = f"J_Bip_{sid}_UpperArm", f"J_Bip_{sid}_LowerArm", f"J_Bip_{sid}_Hand"
    s, e, w = rest[n1], rest[n2], rest[n3]
    l1, l2 = (e - s).length, (w - e).length
    d = target - s
    dist = max(0.05, min(d.length, (l1 + l2) * 0.985))
    d.normalize()
    pole = Vector((side * 0.8, -0.65, -0.55))
    side_v = (pole - d * pole.dot(d)).normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    elbow = s + d * a + side_v * h
    wrist = s + d * dist
    q1 = (e - s).rotation_difference(elbow - s)
    q2 = (q1 @ (w - e)).rotation_difference(wrist - elbow) @ q1
    set_rel(n1, q1)
    set_rel(n2, q1.inverted() @ q2)


def solve_leg(sid, side, target):
    """Bends a leg to put the foot at a place, with the knee forward and the foot staying flat."""
    n1, n2, n3 = f"J_Bip_{sid}_UpperLeg", f"J_Bip_{sid}_LowerLeg", f"J_Bip_{sid}_Foot"
    s, e, w = rest[n1], rest[n2], rest[n3]
    l1, l2 = (e - s).length, (w - e).length
    d = target - s
    dist = max(0.05, min(d.length, (l1 + l2) * 0.995))
    d.normalize()
    pole = Vector((side * 0.15, 1, 0))
    side_v = (pole - d * pole.dot(d)).normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    knee = s + d * a + side_v * h
    ankle = s + d * dist
    q1 = (e - s).rotation_difference(knee - s)
    q2 = (q1 @ (w - e)).rotation_difference(ankle - knee) @ q1
    set_rel(n1, q1)
    set_rel(n2, q1.inverted() @ q2)
    set_rel(n3, q2.inverted())


# The model's right is +X, and it faces +Y, which is towards the camera.
SHOULDER = {"R": rest["J_Bip_R_UpperArm"], "L": rest["J_Bip_L_UpperArm"]}
SIDE = {"R": 1, "L": -1}
ARM = (rest["J_Bip_R_LowerArm"] - rest["J_Bip_R_UpperArm"]).length + (rest["J_Bip_R_Hand"] - rest["J_Bip_R_LowerArm"]).length
CHEST = Vector((0, 0.24, SHOULDER["R"].z - 0.17))


def hanging(sid):
    return SHOULDER[sid] + Vector((SIDE[sid] * 0.075, 0.03, -0.92 * ARM))


def sway(t, sid):
    """Nobody's arm is ever quite still."""
    seed = SIDE[sid] * 1.7
    return Vector((math.sin(t * 1.3 + seed) * 0.006, math.sin(t * 0.9 + seed) * 0.006, math.sin(t * 1.7 + seed) * 0.006))


def clap_at(share, spread=0.32):
    """Both hands, with share 0 apart and 1 together."""
    gap = spread + (0.036 - spread) * share
    return {"R": CHEST + Vector((gap, 0, 0)), "L": CHEST + Vector((-gap, 0, 0))}


def bump(t, start, period):
    """Goes from 0 up to 1 and back again over one period."""
    return (1 - math.cos(2 * math.pi * (t - start) / period)) / 2


def lerp_towards(t, start, length, a, b):
    share = min(1, max(0, (t - start) / length))
    share = share * share * (3 - 2 * share)
    return a.lerp(b, share)


def circle_at(sid, t, start, period, radius, centre):
    angle = 2 * math.pi * (t - start) / period
    # Starts at the bottom and goes up on the outside.
    return centre + Vector((SIDE[sid] * math.sin(angle) * radius, 0, -math.cos(angle) * radius))


def claps(t):
    hands = {"R": hanging("R"), "L": hanging("L")}
    if 2 <= t < 6.8:  # Four claps, at a comfortable speed.
        share = bump(t, 2.3, 1.1) if t >= 2.3 else 0
        if t >= 2.3 + 4.4:
            share = 0
        return clap_at(share)
    if 6.8 <= t < 8:
        return hands
    if 8 <= t < 13:  # Three slow claps, with one hand doing nearly all of the moving.
        share = bump(t, 8.3, 1.5) if 8.3 <= t < 12.8 else 0
        together = clap_at(share)
        together["L"] = CHEST + Vector((-0.1 + (0.1 - 0.036) * share, 0, -0.02))
        return together
    if 13 <= t < 16:  # Hands in front, near each other, but never meeting.
        return clap_at(0.25 + 0.2 * bump(t, 13, 1.4), spread=0.34)
    if 16 <= t < 20:  # Arms swinging at the sides, as when walking.
        swing = math.sin((t - 16) * 3.6) * 0.3
        return {"R": hanging("R") + Vector((0, swing, 0.04)), "L": hanging("L") + Vector((0, -swing, 0.04))}
    return hands


def circles(t):
    hands = {"R": hanging("R"), "L": hanging("L")}
    big_centre = SHOULDER["R"] + Vector((0.16, 0.2, -0.04))
    if 1.6 <= t < 2:
        hands["R"] = lerp_towards(t, 1.6, 0.4, hanging("R"), circle_at("R", t, 2, 3, 0.42, big_centre))
    elif 2 <= t < 8:  # Two big circles with the right hand.
        hands["R"] = circle_at("R", t, 2, 3, 0.42, big_centre)
    elif 8 <= t < 8.4:
        hands["R"] = lerp_towards(t, 8, 0.4, circle_at("R", 8, 2, 3, 0.42, big_centre), hanging("R"))
    small_centre = CHEST + Vector((-0.14, 0.04, 0.02))
    if 9.1 <= t < 9.5:
        hands["L"] = lerp_towards(t, 9.1, 0.4, hanging("L"), circle_at("L", t, 9.5, 2.5, 0.13, small_centre))
    elif 9.5 <= t < 14.5:  # Two small circles with the left hand, in front of the chest.
        hands["L"] = circle_at("L", t, 9.5, 2.5, 0.13, small_centre)
    elif 14.5 <= t < 15:
        hands["L"] = lerp_towards(t, 14.5, 0.5, circle_at("L", 14.5, 9.5, 2.5, 0.13, small_centre), hanging("L"))
    high = SHOULDER["R"] + Vector((0.22, 0.14, 0.3))
    if 15.5 <= t < 16:
        hands["R"] = lerp_towards(t, 15.5, 0.5, hanging("R"), high)
    elif 16 <= t < 20:  # Waving from side to side, which is no circle at all.
        hands["R"] = high + Vector((math.sin((t - 16) * 5) * 0.17, 0, math.sin((t - 16) * 2.3) * 0.02))
    elif 20 <= t < 20.5:
        hands["R"] = lerp_towards(t, 20, 0.5, high, hanging("R"))
    high_left = SHOULDER["L"] + Vector((-0.1, 0.24, -0.1))
    if 20.5 <= t < 24:  # Up and down, in front, which isn't one either.
        hands["L"] = lerp_towards(t, 20.5, 0.4, hanging("L"), high_left + Vector((0, 0, math.sin((t - 20.5) * 3.3) * 0.28)))
    return hands


def wings(t):
    """Arms out like wings, tipping one way and the other, going high and low, and coming down."""
    down = {"R": hanging("R"), "L": hanging("L")}

    def spread(tip=0.0, lift=0.0, reach=0.92):
        out = {}
        for sid in ("R", "L"):
            # tip is the right hand going down and the left going up.
            rise = lift + (-tip if sid == "R" else tip)
            flat = max(0.2, 1 - rise * rise)
            out[sid] = SHOULDER[sid] + Vector((SIDE[sid] * ARM * reach * flat, 0.05, ARM * reach * rise))
        return out

    def blend(start, length, a, b):
        return {sid: lerp_towards(t, start, length, a[sid], b[sid]) for sid in ("R", "L")}

    level = spread()
    if t < 2:
        return down
    if t < 3:
        return blend(2, 1, down, level)
    if t < 5:
        return level
    if t < 6:
        return blend(5, 1, level, spread(tip=0.5))
    if t < 8:
        return spread(tip=0.5)
    if t < 9.5:
        return blend(8, 1.5, spread(tip=0.5), spread(tip=-0.5))
    if t < 11.5:
        return spread(tip=-0.5)
    if t < 12.5:
        return blend(11.5, 1, spread(tip=-0.5), level)
    if t < 13.5:
        return blend(12.5, 1, level, spread(lift=0.55))
    if t < 15:
        return spread(lift=0.55)
    if t < 16.5:
        return blend(15, 1.5, spread(lift=0.55), spread(lift=-0.5))
    if t < 18:
        return spread(lift=-0.5)
    if t < 19:
        return blend(18, 1, spread(lift=-0.5), level)
    if t < 20:
        return level
    if t < 21:
        return blend(20, 1, level, down)
    return down


def envelope(t, up_from, up_to, down_from, down_to):
    """Rises from 0 to 1, holds, and falls back to 0, smoothly."""
    if t <= up_from or t >= down_to:
        return 0.0
    share = 1.0
    if t < up_to:
        share = (t - up_from) / (up_to - up_from)
    elif t > down_from:
        share = (down_to - t) / (down_to - down_from)
    return share * share * (3 - 2 * share)


def squat_arms(share):
    """Arms out in front, for balance, going down into a squat."""
    return {
        sid: hanging(sid).lerp(SHOULDER[sid] + Vector((-SIDE[sid] * 0.02, ARM * 0.92, -0.08)), share)
        for sid in ("R", "L")
    }


def jump_arms(swing_back, swing_up):
    """Arms swinging back before a jump, and up with it."""
    out = {}
    for sid in ("R", "L"):
        at = hanging(sid).lerp(SHOULDER[sid] + Vector((SIDE[sid] * 0.12, -0.3, -0.42)), swing_back)
        out[sid] = at.lerp(SHOULDER[sid] + Vector((SIDE[sid] * 0.22, 0.12, ARM * 0.86)), swing_up)
    return out


def squat_moment(t, start):
    """A squat starting at this moment: down, a moment at the bottom, and up, over 1.6 seconds."""
    return envelope(t, start, start + 0.7, start + 1.0, start + 1.6)


def jump_moment(t, start):
    """Crouch, leave the floor, and land, over 1.3 seconds. Returns the crouch and the height."""
    crouch = envelope(t, start, start + 0.3, start + 0.3, start + 0.5) + envelope(t, start + 0.8, start + 0.95, start + 0.95, start + 1.3) * 0.8
    air = envelope(t, start + 0.3, start + 0.55, start + 0.55, start + 0.85)
    return crouch, air


def fight_demo(t):
    """The first four moves the coach asks for in a fight, at about the pace it asks for them."""
    hands = {"R": hanging("R"), "L": hanging("L")}
    if 0.5 <= t < 2.3:
        together = bump(t, 0.8, 1.1) if 0.8 <= t < 1.9 else 0
        open_arms = clap_at(together)
        ready = envelope(t, 0.5, 0.8, 1.9, 2.3)
        return {sid: hanging(sid).lerp(open_arms[sid], ready) for sid in ("R", "L")}
    if 3.4 <= t < 5:
        return squat_arms(squat_moment(t, 3.4))
    if 6.1 <= t < 7.4:
        crouch, air = jump_moment(t, 6.1)
        return jump_arms(min(1, crouch), air)
    big_centre = SHOULDER["R"] + Vector((0.16, 0.2, -0.04))
    if 8.6 <= t < 9:
        hands["R"] = lerp_towards(t, 8.6, 0.4, hanging("R"), circle_at("R", 9, 9, 3, 0.42, big_centre))
    elif 9 <= t < 12:
        hands["R"] = circle_at("R", t, 9, 3, 0.42, big_centre)
    elif 12 <= t < 12.4:
        hands["R"] = lerp_towards(t, 12, 0.4, circle_at("R", 12, 9, 3, 0.42, big_centre), hanging("R"))
    return hands


def fight_body(t):
    if 3.4 <= t < 5:
        return 0.3 * squat_moment(t, 3.4), 0, 0.3 * squat_moment(t, 3.4)
    if 6.1 <= t < 7.4:
        crouch, air = jump_moment(t, 6.1)
        return 0.13 * crouch, 0.24 * air, 0.1 * crouch
    return 0, 0, 0


TRAIL_MOVES = [("jump", 1.9), ("squat", 5.3), ("jump", 8.6)]


def trail_demo(t):
    """Jumping over something, squatting under something, and jumping again."""
    for move, start in TRAIL_MOVES:
        if move == "squat" and start <= t < start + 1.6:
            return squat_arms(squat_moment(t, start))
        if move == "jump" and start <= t < start + 1.3:
            crouch, air = jump_moment(t, start)
            return jump_arms(min(1, crouch), air)
    return {"R": hanging("R"), "L": hanging("L")}


def trail_body(t):
    for move, start in TRAIL_MOVES:
        if move == "squat" and start <= t < start + 1.6:
            return 0.3 * squat_moment(t, start), 0, 0.3 * squat_moment(t, start)
        if move == "jump" and start <= t < start + 1.3:
            crouch, air = jump_moment(t, start)
            return 0.13 * crouch, 0.24 * air, 0.1 * crouch
    return 0, 0, 0


# Each clip: what the arms do, how long it lasts, and what the rest of the body does if it moves.
CLIPS = {
    "claps": (claps, 20, None),
    "circles": (circles, 24, None),
    "wings": (wings, 24, None),
    "demo-fight": (fight_demo, 13.5, fight_body),
    "demo-trail": (trail_demo, 11, trail_body),
}
pick, length, body_at = CLIPS[CLIP]
FEET = {"R": rest["J_Bip_R_Foot"], "L": rest["J_Bip_L_Foot"]}
os.makedirs(OUT, exist_ok=True)
total = int(length * FPS)
first = FIRST if FIRST is not None else 0
last = LAST if LAST is not None else total - 1
random.seed(1)
for index in range(first, last + 1):
    t = index / FPS
    hands = pick(t)
    for sid, at in hands.items():
        solve_arm(sid, SIDE[sid], at + sway(t, sid))
    if body_at:
        drop, up, lean = body_at(t)
        arm.location.z = up - drop
        for sid in ("R", "L"):
            # Feet stay on the floor while the body sinks, and go with it when it leaves the floor.
            solve_leg(sid, SIDE[sid], FEET[sid] + Vector((0, 0, drop)))
        set_rel("J_Bip_C_UpperChest", Euler((-lean, 0, 0)).to_quaternion())
    for sid in ("L", "R"):
        for finger in ("Index", "Middle", "Ring", "Little"):
            for joint in (1, 2, 3):
                set_rel(f"J_Bip_{sid}_{finger}{joint}", Euler((0, 0, 0)).to_quaternion())
    set_rel("J_Bip_C_Spine", Euler((math.radians(math.sin(t * 0.8) * 0.6), 0, 0)).to_quaternion())
    scene.render.filepath = os.path.join(OUT, f"{index:05d}.jpg")
    bpy.ops.render.render(write_still=True)
print("rendered", first, last)

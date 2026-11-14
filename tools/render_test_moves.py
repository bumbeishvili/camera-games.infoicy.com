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


def raised(sid, degrees):
    """A hand raised in front and a little out to the side: 0 hangs down, 90 is shoulder height, 180 straight up."""
    angle = math.radians(degrees)
    reach = ARM * 0.93
    return SHOULDER[sid] + Vector((
        SIDE[sid] * (0.075 + 0.42 * reach * math.sin(angle)),
        0.03 + 0.8 * reach * math.sin(angle),
        -reach * math.cos(angle),
    ))


def angle_at(t, keys):
    """How far an arm is raised at a moment, from a list of (seconds, degrees), easing from each to the next."""
    for (start, a), (end, b) in zip(keys, keys[1:]):
        if start <= t < end:
            share = (t - start) / (end - start)
            return a + (b - a) * share * share * (3 - 2 * share)
    return keys[-1][1]


# Mighty Lift: an arm raised and held, as lifting a weight. The right arm right up, held, and down gently;
# to shoulder height, held, and dropped; the left arm; both; a hold that wobbles; a small raise; and both
# with the left only as high as the shoulder.
LIFT_RIGHT = [(0, 0), (1.5, 0), (2.6, 172), (5.2, 172), (6.4, 0), (7.6, 0), (8.5, 92), (10.5, 92), (10.9, 0),
              (17, 0), (18, 172), (20.5, 172), (21.5, 0), (22.5, 0), (23.4, 165), (26, 165), (26.9, 0),
              (28, 0), (28.8, 55), (30.6, 55), (31.3, 0), (32.3, 0), (33.3, 172), (35.3, 172), (36.2, 0), (37, 0)]
LIFT_LEFT = [(0, 0), (12, 0), (13, 172), (15, 172), (16, 0), (17, 0), (18, 172), (20.5, 172), (21.5, 0),
             (32.3, 0), (33.3, 90), (35.3, 90), (36.2, 0), (37, 0)]


def lifts(t):
    hands = {"R": raised("R", angle_at(t, LIFT_RIGHT)), "L": raised("L", angle_at(t, LIFT_LEFT))}
    if 23.4 <= t < 26:  # Held up, but shaking, as a tired arm does.
        beat = (t - 23.4) * 2 * math.pi * 2.2
        hands["R"] = hands["R"] + Vector((math.sin(beat) * 0.05, 0, math.sin(beat + 1) * 0.1))
    return hands


# Moto Mountain: the body leaning to the side, bending at the waist as a child on a seat does. First a dial, to
# pick a lean from by its time: from 20 degrees to the left at 1 second, evenly, to 20 degrees to the right at 11.
# Then leans as a child makes them: to the right and held, upright, to the left and held, and upright again.
LEAN_KEYS = [(11, 20), (12, 0), (13, 0), (14, 16), (16.5, 16), (17.5, 0), (18.5, 0), (19.5, -16), (22, -16), (23, 0), (24, 0)]
LEAN_SHOULDERS = 0.7  # How far round the shoulders go, as a share of how far the top of the spine tips.


def lean_at(t):
    """How far the body leans to its right, in degrees."""
    if t < 1:
        return 0
    if t < 11:
        return (t - 6) * 4
    return angle_at(t, LEAN_KEYS)


def leans(t):
    """Arms hanging from the shoulders, wherever the lean has taken them."""
    turn = math.radians(lean_at(t)) * LEAN_SHOULDERS
    pivot = rest["J_Bip_C_Spine"]
    hands = {}
    for sid in ("R", "L"):
        x, z = SHOULDER[sid].x - pivot.x, SHOULDER[sid].z - pivot.z
        shoulder = Vector((pivot.x + x * math.cos(turn) + z * math.sin(turn), SHOULDER[sid].y, pivot.z - x * math.sin(turn) + z * math.cos(turn)))
        hands[sid] = shoulder + Vector((SIDE[sid] * 0.075, 0.03, -0.92 * ARM))
    return hands


def leans_body(t):
    return 0, 0, 0, math.radians(lean_at(t))


# Rooftop Rope: standing on one leg. First a dial for each foot, to pick a height from by its time: the right
# foot goes up evenly from the floor at 1 second to 48 centimetres at 9, and the left from 10 seconds to 18. Then
# lifts as a child makes them: the right foot up 30 centimetres and held, down, the left the same, and a small
# lift of the right, 8 centimetres.
STAND_RIGHT = [(19, 0), (20, 0), (21, 0.3), (24.5, 0.3), (25.5, 0), (33, 0), (34, 0.08), (36, 0.08), (36.8, 0), (38, 0)]
STAND_LEFT = [(19, 0), (26.5, 0), (27.5, 0.3), (31, 0.3), (32, 0), (38, 0)]


def feet_up(t):
    """How high each foot is off the floor, in metres."""
    if 1 <= t < 9:
        return {"R": (t - 1) * 0.06, "L": 0}
    if 10 <= t < 18:
        return {"R": 0, "L": (t - 10) * 0.06}
    if t >= 19:
        return {"R": angle_at(t, STAND_RIGHT), "L": angle_at(t, STAND_LEFT)}
    return {"R": 0, "L": 0}


def stands(t):
    """Arms a little out from the sides, as someone balancing holds them."""
    return {sid: hanging(sid) + Vector((SIDE[sid] * 0.14, 0, 0.06)) for sid in ("R", "L")}


def stands_body(t):
    # A lifted foot comes forward a little as it goes up, as the knee bends.
    return 0, 0, 0, 0, {sid: Vector((0, 0.3 * high, high)) for sid, high in feet_up(t).items()}


# Rooftop Rope: both feet on the floor, one behind the other, which is not a lifted foot, though the camera sees
# the foot that's further away as higher in the picture. The right foot slides back evenly, 10 centimetres a
# second, from 1 second to 40 centimetres behind at 5, and is back beside the other by 6. The left does the same
# from 7 seconds to 11, and is back by 12.
def feet_back(t):
    """How far behind the other each foot is, in metres, on the floor."""
    if 1 <= t < 5:
        return {"R": (t - 1) * 0.1, "L": 0}
    if 5 <= t < 6:
        return {"R": 0.4 * (6 - t), "L": 0}
    if 7 <= t < 11:
        return {"R": 0, "L": (t - 7) * 0.1}
    if 11 <= t < 12:
        return {"R": 0, "L": 0.4 * (12 - t)}
    return {"R": 0, "L": 0}


def staggers_body(t):
    back = feet_back(t)
    # The body sinks a little as the feet come apart, as a real one does, so that both stay flat on the floor.
    most = max(back.values())
    return 0.8 * most * most, 0, 0, 0, {sid: Vector((0, -far, 0)) for sid, far in back.items()}


# Each clip: what the arms do, how long it lasts, and what the rest of the body does if it moves.
CLIPS = {
    "claps": (claps, 20, None),
    "circles": (circles, 24, None),
    "wings": (wings, 24, None),
    "demo-fight": (fight_demo, 13.5, fight_body),
    "demo-trail": (trail_demo, 11, trail_body),
    "lifts": (lifts, 37, None),
    "leans": (leans, 24, leans_body),
    "stands": (stands, 38, stands_body),
    "staggers": (stands, 13, staggers_body),
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
    side = 0
    if body_at:
        drop, up, lean, *more = body_at(t)
        side = more[0] if more else 0
        lifted = more[1] if len(more) > 1 else {}
        arm.location.z = up - drop
        for sid in ("R", "L"):
            # Feet stay on the floor while the body sinks, and go with it when it leaves the floor. One that's
            # lifted goes where the clip puts it.
            solve_leg(sid, SIDE[sid], FEET[sid] + Vector((0, 0, drop)) + lifted.get(sid, Vector((0, 0, 0))))
        set_rel("J_Bip_C_UpperChest", Euler((-lean, 0, 0)).to_quaternion())
    for sid in ("L", "R"):
        for finger in ("Index", "Middle", "Ring", "Little"):
            for joint in (1, 2, 3):
                set_rel(f"J_Bip_{sid}_{finger}{joint}", Euler((0, 0, 0)).to_quaternion())
    # A lean to the side is a bend spread up the spine, a third at each of three places.
    set_rel("J_Bip_C_Spine", Euler((math.radians(math.sin(t * 0.8) * 0.6), side / 3, 0)).to_quaternion())
    if side:
        set_rel("J_Bip_C_Chest", Euler((0, side / 3, 0)).to_quaternion())
        set_rel("J_Bip_C_UpperChest", Euler((0, side / 3, 0)).to_quaternion())
    scene.render.filepath = os.path.join(OUT, f"{index:05d}.jpg")
    bpy.ops.render.render(write_still=True)
print("rendered", first, last)

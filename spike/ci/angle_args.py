"""Prints the GN args for the ANGLE build: Vulkan backend only, offscreen-only "null" display (no window-system
extensions requested from the driver) and a statically linked Vulkan loader. Usage: angle_args.py <platform-id> <cpu>"""
import sys

platform, cpu = sys.argv[1], sys.argv[2]
args = {
    "is_debug": "false", "is_component_build": "false", "dcheck_always_on": "false", "symbol_level": "0",
    "target_cpu": f'"{cpu}"', "angle_build_tests": "false", "angle_enable_vulkan": "true",
    "angle_use_vulkan_null_display": "true", "angle_shared_libvulkan": "false",
    "angle_enable_swiftshader": "false", "angle_enable_gl": "false", "angle_enable_null": "false",
    "angle_enable_wgpu": "false", "angle_enable_vulkan_validation_layers": "false",
    "angle_has_frame_capture": "false", "angle_enable_perfetto": "false",
}
if platform.startswith("mac"):
    args["angle_enable_metal"] = "false"
if platform.startswith("win"):
    args.update({"angle_enable_d3d9": "false", "angle_enable_d3d11": "false"})
if platform.startswith("linux"):
    args.update({"angle_use_x11": "false", "angle_use_wayland": "false"})
print(" ".join(f"{k}={v}" for k, v in args.items()))

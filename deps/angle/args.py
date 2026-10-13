"""Prints args.gn for the ANGLE build: Vulkan backend only, the offscreen-only "null" display (it requests
no window-system extensions from the driver), and a statically linked Vulkan loader except on Windows,
where the loader's DllMain clashes with ANGLE's and vulkan-1.dll ships next to ANGLE instead.
Usage: args.py <platform> <cpu>   (platform as in Node: darwin, linux, win32; cpu: x64, arm64)"""
import sys

platform, cpu = sys.argv[1], sys.argv[2]
args = {
    "is_debug": "false", "is_component_build": "false", "dcheck_always_on": "false", "symbol_level": "0",
    "target_cpu": f'"{cpu}"', "angle_build_tests": "false", "angle_enable_vulkan": "true",
    "angle_use_vulkan_null_display": "true", "angle_shared_libvulkan": str(platform == "win32").lower(),
    "angle_enable_swiftshader": "false", "angle_enable_gl": "false", "angle_enable_null": "false",
    "angle_enable_wgpu": "false", "angle_enable_vulkan_validation_layers": "false",
    "angle_has_frame_capture": "false", "angle_enable_perfetto": "false",
}
if platform == "darwin":
    args["angle_enable_metal"] = "false"
if platform == "win32":
    args.update({"angle_enable_d3d9": "false", "angle_enable_d3d11": "false"})
if platform == "linux":
    args.update({"angle_use_x11": "false", "angle_use_wayland": "false"})
print("\n".join(f"{k} = {v}" for k, v in args.items()))

"""Prints a .gclient for a trimmed ANGLE checkout (no CTS, SwiftShader, tracing or validation layers).
Usage: write_gclient.py <platform-id>   e.g. linux-arm64 adds the arm64 sysroot via target_cpu."""
import sys

platform = sys.argv[1]
skip = [
    "third_party/VK-GL-CTS/src", "third_party/SwiftShader", "third_party/catapult", "third_party/perfetto",
    "third_party/glmark2/src", "third_party/vulkan-validation-layers/src", "third_party/lunarg-vulkantools/src",
    "tools/perf", "third_party/OpenCL-Docs/src",
]
deps = ",\n".join(f'    "{d}": None' for d in skip)
extra = '\ntarget_cpu = ["arm64"]' if platform == "linux-arm64" else ""
print(f'''solutions = [{{
  "name": ".",
  "url": "https://chromium.googlesource.com/angle/angle.git",
  "deps_file": "DEPS",
  "managed": False,
  "custom_deps": {{
{deps}
  }},
}}]{extra}''')

"""Prints the .gclient for a trimmed ANGLE checkout: no conformance tests, SwiftShader, tracing or
validation layers."""
skip = [
    "third_party/VK-GL-CTS/src", "third_party/SwiftShader", "third_party/catapult", "third_party/perfetto",
    "third_party/glmark2/src", "third_party/vulkan-validation-layers/src", "third_party/lunarg-vulkantools/src",
    "tools/perf", "third_party/OpenCL-Docs/src",
]
deps = ",\n".join(f'    "{d}": None' for d in skip)
print(f'''solutions = [{{
  "name": ".",
  "url": "https://chromium.googlesource.com/angle/angle.git",
  "deps_file": "DEPS",
  "managed": False,
  "custom_deps": {{
{deps}
  }},
}}]''')

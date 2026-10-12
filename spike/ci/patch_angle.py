"""With the offscreen-only null display, skip ANGLE's macOS window-system sources (they need Cocoa,
QuartzCore and IOSurface). One-line edit; written as a script so it works with any line endings."""
from pathlib import Path

gni = Path("src/libANGLE/renderer/vulkan/vulkan_backend.gni")
text = gni.read_text()
old = "if (is_mac) {\n  vulkan_backend_sources += [\n    \"mac/DisplayVkMac.h\","
new = "if (is_mac && !angle_use_vulkan_null_display) {\n  vulkan_backend_sources += [\n    \"mac/DisplayVkMac.h\","
text = text.replace("\r\n", "\n")
assert old in text, "ANGLE source layout changed"
gni.write_text(text.replace(old, new, 1))
print("patched", gni)

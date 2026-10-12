"""Linux x64 builds and measurements for the headless WebGL2 spike.

  modal run spike/modal/app.py::build          # ANGLE + Mesa on 32 CPUs -> volume
  modal run spike/modal/app.py::bench          # shader_load on a 2-vCPU container
  modal run spike/modal/app.py::shell_cmd --cmd "..."   # ad-hoc command on a 2-vCPU container

Artifacts live in the `webgl-spike` volume:
  /vol/angle/   libEGL.so libGLESv2.so libvk_swiftshader.so vk_swiftshader_icd.json + test binaries
  /vol/mesa/    lib/libvulkan_lvp.so lib/libgallium*.so lib/libEGL.so ... share/vulkan/icd.d/
"""

import subprocess
from pathlib import Path

import modal

HERE = Path(__file__).parent
SPIKE = HERE.parent
MESA_VERSION = "26.2.4"

app = modal.App("webgl-spike")
vol = modal.Volume.from_name("webgl-spike", create_if_missing=True)

image = (
    modal.Image.from_registry("ubuntu:24.04", add_python="3.12")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "UTC"})
    .apt_install(
        "build-essential", "git", "curl", "xz-utils", "lsb-release", "sudo", "file", "pkg-config",
        "bison", "flex", "glslang-tools", "llvm-18-dev", "libclang-18-dev", "clang-18", "libpolly-18-dev",
        "libexpat1-dev", "zlib1g-dev", "libdrm-dev", "libelf-dev", "time", "procps", "rsync",
    )
    .pip_install("meson", "ninja", "mako", "pyyaml", "packaging")
    .run_commands("git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git /opt/depot_tools")
    .env({"PATH": "/usr/local/bin:/opt/depot_tools:/usr/bin:/bin", "DEPOT_TOOLS_UPDATE": "0"})
    .run_commands("cd /opt/depot_tools && ./ensure_bootstrap")
    .run_commands("curl -fsSL https://nodejs.org/dist/v22.17.1/node-v22.17.1-linux-x64.tar.xz | tar xJ -C /opt && ln -s /opt/node-v22.17.1-linux-x64/bin/* /usr/local/bin/")
    .add_local_dir(SPIKE / "bench", "/spike/bench")
    .add_local_dir(SPIKE / "harness", "/spike/harness", ignore=["node_modules", "out", "*.node", "gl_gen.c", "build", "*.plain.glb"])
)


def sh(cmd: str, cwd: str | None = None) -> None:
    print(f"$ {cmd}", flush=True)
    subprocess.run(["bash", "-lc", f"set -euo pipefail; {cmd}"], cwd=cwd, check=True)


ANGLE_GN_ARGS = " ".join([
    "is_debug=false",
    "is_component_build=false",
    "dcheck_always_on=false",
    "angle_build_tests=true",
    "angle_enable_vulkan=true",
    "angle_enable_swiftshader=true",
    "angle_use_x11=false",
    "angle_use_wayland=true",  # Linux GL backend requires x11 or wayland; we only use its surfaceless EGL path
    "angle_use_vulkan_display=true",
    "angle_vulkan_display_mode=\"headless\"",
    "angle_enable_vulkan_validation_layers=false",
    "symbol_level=0",
])


@app.function(image=image, cpu=32, memory=65536, ephemeral_disk=512 * 1024, timeout=6 * 3600, volumes={"/vol": vol})
def build(skip_angle: bool = False, skip_mesa: bool = False):
    if not skip_mesa:
        sh(f"curl -sL https://archive.mesa3d.org/mesa-{MESA_VERSION}.tar.xz | tar xJ -C /root")
        sh(
            "meson setup build --prefix=/vol/mesa --buildtype=release -Db_ndebug=true "
            "-Dgallium-drivers=llvmpipe -Dvulkan-drivers=swrast -Dplatforms= -Dglx=disabled -Degl=enabled "
            "-Dgles1=disabled -Dgles2=enabled -Dopengl=true -Dllvm=enabled -Dshared-llvm=disabled "
            "-Dshader-cache=enabled -Dgbm=disabled -Dvideo-codecs= -Dtools= -Dzstd=disabled -Dvulkan-layers= "
            "-Dlibunwind=disabled -Dvalgrind=disabled -Dlmsensors=disabled "
            "&& rm -rf /vol/mesa && ninja -C build install",
            cwd=f"/root/mesa-{MESA_VERSION}",
        )
        vol.commit()
    if not skip_angle:
        sh("git clone -q --depth 1 https://chromium.googlesource.com/angle/angle /root/angle")
        sh("python3 scripts/bootstrap.py && gclient sync --no-history -j 32", cwd="/root/angle")
        sh("sudo ./build/install-build-deps.sh --no-prompt --no-chromeos-fonts --no-arm --no-nacl || true", cwd="/root/angle")
        sh(f"gn gen out/Release --args='{ANGLE_GN_ARGS}'", cwd="/root/angle")
        sh("autoninja -C out/Release libEGL libGLESv2 angle_deqp_gles3_tests angle_end2end_tests", cwd="/root/angle")
        # Keep runtime pieces and test binaries with their data; drop object files.
        sh("rm -rf /vol/angle /vol/angle-include && mkdir -p /vol/angle && "
           "rsync -a --exclude obj --exclude '*.ninja*' out/Release/ /vol/angle/ && cp -r include /vol/angle-include",
           cwd="/root/angle")
        sh("du -sh /vol/angle && ls /vol/angle | head -50")
        vol.commit()


SMALL = dict(image=image, cpu=2.0, memory=4096, timeout=3 * 3600, volumes={"/vol": vol})
LVP_ICD = "/vol/mesa/share/vulkan/icd.d/lvp_icd.x86_64.json"


def build_bench() -> None:
    sh("cc -O2 /spike/bench/shader_load.c -I/vol/mesa/include -L/vol/mesa/lib/x86_64-linux-gnu -L/vol/mesa/lib "
       "-lEGL -lGLESv2 -Wl,-rpath,/vol/mesa/lib/x86_64-linux-gnu:/vol/mesa/lib -o /root/load_mesa")
    sh("cc -O2 -DUSE_ANGLE /spike/bench/shader_load.c -I/vol/angle-include -L/vol/angle "
       "-l:libEGL.so -l:libGLESv2.so -Wl,-rpath,/vol/angle -o /root/load_angle")


@app.function(**SMALL)
def shell_cmd(cmd: str):
    build_bench()
    sh(cmd)


@app.function(**SMALL)
def bench(count: int = 40, runs: int = 3):
    build_bench()
    # mesa_dir has lib/ or lib/x86_64-linux-gnu depending on meson's libdir default.
    sh("ls /vol/mesa/share/vulkan/icd.d/")
    stacks = {
        "mesa-llvmpipe (no ANGLE)": "/root/load_mesa",
        "angle-gles-llvmpipe": "BACKEND=gles /root/load_angle",
        "angle-vulkan-lavapipe": f"BACKEND=vulkan VK_ICD_FILENAMES={LVP_ICD} /root/load_angle",
        "angle-vulkan-swiftshader": "BACKEND=swiftshader /root/load_angle",
    }
    for name, cmd in stacks.items():
        for run in range(runs):
            sh(f"rm -rf /root/cache /root/.cache; echo '[{name}] cold #{run}'; "
               f"MESA_SHADER_CACHE_DIR=/root/cache /usr/bin/time -f 'peak %M KB' env {cmd} {count}")
        for run in range(runs):
            sh(f"echo '[{name}] warm #{run}'; "
               f"MESA_SHADER_CACHE_DIR=/root/cache /usr/bin/time -f 'peak %M KB' env {cmd} {count}")


LIBDIRS = "/vol/mesa/lib/x86_64-linux-gnu:/vol/mesa/lib"


def setup_harness() -> None:
    sh("cp -r /spike/harness /root/harness && cd /root/harness && npm ci --silent && node prep-models.mjs && mkdir -p out && addon/build.sh")


def scene_env(backend: str, cache: str) -> str:
    base = f"ANGLE_DIR=/vol/angle MESA_SHADER_CACHE_DIR={cache} CACHE_DIR={cache} BACKEND={backend} LP_NUM_THREADS=2"
    if backend == "vulkan":
        return f"{base} VK_ICD_FILENAMES={LVP_ICD}"
    if backend == "gles":  # ANGLE's GL backend dlopens libEGL.so.1 -> Mesa's surfaceless llvmpipe
        return f"{base} LD_LIBRARY_PATH={LIBDIRS}"
    return base


@app.function(**SMALL)
def scenes(runs: int = 3, backends: str = "vulkan,gles,swiftshader"):
    """Same 2-vCPU container, same harness and scenes, one backend after another."""
    setup_harness()
    for backend in backends.split(","):
        sh(f"cd /root/harness && {scene_env(backend, '/root/cache-' + backend)} node bench-scenes.mjs {runs} | tee -a out/scenes.jsonl")
    sh("mkdir -p /vol/results && cp /root/harness/out/*.png /root/harness/out/scenes.jsonl /vol/results/")
    vol.commit()


@app.function(**SMALL)
def cache_fill():
    """Fills a lavapipe shader cache for all scenes and stores it in the volume."""
    setup_harness()
    sh("rm -rf /vol/shared-cache && cd /root/harness && for s in pbr soldier tokyo; do "
       f"{scene_env('vulkan', '/vol/shared-cache')} node render.mjs $s; done; cat /proc/cpuinfo | grep -m1 'model name'")
    vol.commit()


@app.function(**SMALL)
def cache_reuse():
    """Runs in a fresh container: copies the stored cache and renders warm (if keys match) or cold."""
    setup_harness()
    sh("cat /proc/cpuinfo | grep -m1 'model name'; cp -r /vol/shared-cache /root/reused && cd /root/harness && for s in pbr soldier tokyo; do "
       f"{scene_env('vulkan', '/root/reused')} node render.mjs $s; done; du -sh /root/reused /vol/shared-cache")

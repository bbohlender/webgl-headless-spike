# Sourced by the dependency builds. On Windows (Git Bash with MSVC from vcvars on PATH), puts MSVC's
# directory first so `link` is MSVC's linker rather than coreutils' link, and converts paths for the
# native tools (cmake, meson), which do not understand /d/... paths. On Linux, builds with clang: GCC
# makes lavapipe a fifth larger (gzipped) for the same speed.
case "$(uname -s)" in
  MINGW*|MSYS*)
    PATH="$(dirname "$(command -v cl)"):$PATH"
    native_path() { cygpath -m "$1"; } ;;
  Linux) export CC=clang CXX=clang++
    native_path() { echo "$1"; } ;;
  *) native_path() { echo "$1"; } ;;
esac

# Downloads <url> to <file>, retrying: source hosts sometimes drop connections.
download() {
  for attempt in 1 2 3 4 5; do
    curl -fsSL --max-time 900 -o "$2" "$1" && return
    sleep 15
  done
  return 1
}

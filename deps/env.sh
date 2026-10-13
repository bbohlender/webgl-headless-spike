# Sourced by the dependency builds. On Windows (Git Bash with MSVC from vcvars on PATH), puts MSVC's
# directory first so `link` is MSVC's linker rather than coreutils' link, and converts paths for the
# native tools (cmake, meson), which do not understand /d/... paths.
case "$(uname -s)" in
  MINGW*|MSYS*)
    PATH="$(dirname "$(command -v cl)"):$PATH"
    native_path() { cygpath -m "$1"; } ;;
  *) native_path() { echo "$1"; } ;;
esac

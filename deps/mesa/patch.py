"""Makes gallivm build its LLVM pass pipeline from pass objects (lp_bld_passes.cpp) instead of
parsing it from text with LLVMRunPasses, whose parser links every pass LLVM has (vectorizers, OpenMP,
sanitizers, ...) into lavapipe. Same passes, same generated code, a quarter less driver. Text edits
written as a script so they work with any line endings; run in Mesa's source directory."""
import shutil
from pathlib import Path

gallivm = Path("src/gallium/auxiliary/gallivm")


def edit(path, old, new):
    text = path.read_text().replace("\r\n", "\n")
    assert old in text, f"Mesa source layout changed: {path}"
    path.write_text(text.replace(old, new, 1))


shutil.copy(Path(__file__).with_name("lp_bld_passes.cpp"), gallivm)
edit(Path("src/gallium/auxiliary/meson.build"), "    'gallivm/lp_bld_passmgr.c',\n",
     "    'gallivm/lp_bld_passmgr.c',\n    'gallivm/lp_bld_passes.cpp',\n")
passmgr = gallivm / "lp_bld_passmgr.c"
edit(passmgr, "#include <llvm-c/Transforms/PassBuilder.h>",
     "#include <llvm-c/TargetMachine.h>\nvoid lp_run_passes(LLVMModuleRef module, LLVMTargetMachineRef tm, bool optimize);")
text = passmgr.read_text()
start = text.index("   char passes[1024];")
end_marker = "   LLVMDisposePassBuilderOptions(opts);\n"
end = text.index(end_marker, start) + len(end_marker)
passmgr.write_text(text[:start] + "   lp_run_passes(module, tm, !(gallivm_perf & GALLIVM_PERF_NO_OPT));\n" + text[end:])
print("patched", passmgr)

/*
 * The pipeline lp_passmgr_run used to give LLVMRunPasses as text ("default<O0>", then
 * "sroa,early-cse,..."), built from pass objects instead: parsing pass names links every pass LLVM
 * has, constructing them links only these.
 */
#include <llvm-c/Core.h>
#include <llvm-c/TargetMachine.h>
#include <llvm/IR/PassManager.h>
#include <llvm/Passes/PassBuilder.h>
#include <llvm/Analysis/CGSCCPassManager.h>
#include <llvm/Transforms/Coroutines/CoroCleanup.h>
#include <llvm/Transforms/Coroutines/CoroConditionalWrapper.h>
#include <llvm/Transforms/Coroutines/CoroEarly.h>
#include <llvm/Transforms/Coroutines/CoroSplit.h>
#include <llvm/Transforms/IPO/AlwaysInliner.h>
#include <llvm/Transforms/IPO/GlobalDCE.h>
#include <llvm/Transforms/InstCombine/InstCombine.h>
#include <llvm/Transforms/Scalar/EarlyCSE.h>
#include <llvm/Transforms/Scalar/Reassociate.h>
#include <llvm/Transforms/Scalar/SROA.h>
#include <llvm/Transforms/Scalar/SimplifyCFG.h>
#include <llvm/Transforms/Scalar/InstSimplifyPass.h>
#include <llvm/Transforms/Utils/Mem2Reg.h>
#include <llvm/Target/TargetMachine.h>

using namespace llvm;

static TargetMachine *unwrap(LLVMTargetMachineRef P) { return reinterpret_cast<TargetMachine *>(P); }

static void run(Module &module, TargetMachine *tm, ModulePassManager &MPM)
{
   PassBuilder PB(tm);
   LoopAnalysisManager LAM;
   FunctionAnalysisManager FAM;
   CGSCCAnalysisManager CGAM;
   ModuleAnalysisManager MAM;
   PB.registerLoopAnalyses(LAM);
   PB.registerFunctionAnalyses(FAM);
   PB.registerCGSCCAnalyses(CGAM);
   PB.registerModuleAnalyses(MAM);
   PB.crossRegisterProxies(LAM, FAM, CGAM, MAM);
   MPM.run(module, MAM);
}

extern "C" void
lp_run_passes(LLVMModuleRef M, LLVMTargetMachineRef tm, bool optimize)
{
   Module &module = *unwrap(M);
   {
      /* default<O0>: what it does beyond these passes needs options gallivm never sets */
      ModulePassManager MPM;
      MPM.addPass(AlwaysInlinerPass(/*InsertLifetimeIntrinsics=*/false));
      ModulePassManager CoroPM;
      CoroPM.addPass(CoroEarlyPass());
      CGSCCPassManager CGPM;
      CGPM.addPass(CoroSplitPass());
      CoroPM.addPass(createModuleToPostOrderCGSCCPassAdaptor(std::move(CGPM)));
      CoroPM.addPass(CoroCleanupPass());
      CoroPM.addPass(GlobalDCEPass());
      MPM.addPass(CoroConditionalWrapper(std::move(CoroPM)));
      run(module, unwrap(tm), MPM);
   }
   FunctionPassManager FPM;
   if (optimize) {
      FPM.addPass(SROAPass(SROAOptions::ModifyCFG));
      FPM.addPass(EarlyCSEPass());
      FPM.addPass(SimplifyCFGPass());
      FPM.addPass(ReassociatePass());
      FPM.addPass(PromotePass());
      FPM.addPass(InstSimplifyPass());
      FPM.addPass(InstCombinePass(InstCombineOptions().setVerifyFixpoint(false)));
   } else {
      FPM.addPass(PromotePass());
   }
   ModulePassManager MPM;
   MPM.addPass(createModuleToFunctionPassAdaptor(std::move(FPM)));
   run(module, unwrap(tm), MPM);
}

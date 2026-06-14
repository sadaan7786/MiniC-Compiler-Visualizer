/* ============================================================
   tac.h — Three Address Code (TAC) Generation
   Compiler Construction Visualizer Project

   Phase 6: Intermediate Code Generation
   ----------------------------------------
   Three Address Code (TAC) is an intermediate representation
   that simplifies complex expressions into sequences of simple
   operations with at most THREE addresses (operands):

     result = operand1  OP  operand2

   Examples:
     t1 = 3 * 2          ← multiplication
     t2 = 5 + t1         ← addition using temp
     a  = t2             ← assignment
     t3 = a > 5          ← relational
     ifFalse t3 goto L1  ← conditional jump
     goto L0             ← unconditional jump
     L1:                 ← label definition
     print a             ← output

   Benefits of TAC:
   - Machine-independent
   - Easy to optimise (constant folding, dead code elimination)
   - Easy to translate to assembly
   ============================================================ */

#ifndef TAC_H
#define TAC_H

#include <stdio.h>
#include <stdarg.h>

/* ── emit_tac ────────────────────────────────────────────── */
/*    Write a TAC instruction to the output file             */
static inline void emit_tac(FILE *out, const char *fmt, ...) {
    if (!out) return;
    va_list args;
    va_start(args, fmt);
    vfprintf(out, fmt, args);
    fprintf(out, "\n");
    va_end(args);
}

/* ── emit_tac_comment ─────────────────────────────────────── */
/*    Write a human-readable comment line (prefixed with ';') */
static inline void emit_tac_comment(FILE *out, const char *fmt, ...) {
    if (!out) return;
    fprintf(out, "; ");
    va_list args;
    va_start(args, fmt);
    vfprintf(out, fmt, args);
    fprintf(out, "\n");
    va_end(args);
}

#endif /* TAC_H */

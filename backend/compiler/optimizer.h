/* ============================================================
   optimizer.h — TAC Optimiser
   Compiler Construction Visualizer Project

   Phase 7: Code Optimisation
   ---------------------------
   We apply two classic optimisations to the TAC:

   1. CONSTANT FOLDING (already done inline in parser.y)
      Replace  t1 = 3 * 2  with  t1 = 6  at compile time.
      The parser marks nodes as is_const and folds them.

   2. DEAD CODE ELIMINATION
      Remove assignments whose result is NEVER USED after
      assignment.  We do a simple single-pass liveness scan:
        - Build a set of "live" names (all right-hand sides used)
        - Any left-hand side not in that set → dead assignment

   Note: The optimizer reads tac_out (already written) and
   writes a cleaned version to opt_out.
   ============================================================ */

#ifndef OPTIMIZER_H
#define OPTIMIZER_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_TAC_LINES 2048
#define MAX_LINE_LEN  256

extern char tac_lines[MAX_TAC_LINES][MAX_LINE_LEN];
extern int tac_line_count;

/* ── load_tac_from_file ──────────────────────────────────── */
static inline void load_tac_from_file(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return;
    tac_line_count = 0;
    while (fgets(tac_lines[tac_line_count], MAX_LINE_LEN, f) &&
           tac_line_count < MAX_TAC_LINES) {
        /* Strip trailing newline */
        int len = strlen(tac_lines[tac_line_count]);
        if (len > 0 && tac_lines[tac_line_count][len-1] == '\n')
            tac_lines[tac_line_count][len-1] = '\0';
        tac_line_count++;
    }
    fclose(f);
}

/* ── extract_lhs ─────────────────────────────────────────── */
/*    Get the variable name on the left hand side of "x = ..."
     Returns NULL if line is a label, jump, print, or comment. */
static inline char* extract_lhs(const char *line) {
    static char buf[64];
    /* Skip comments and labels */
    if (line[0] == ';' || line[0] == '\0') return NULL;
    if (strstr(line, "goto ") == line)     return NULL;
    if (strstr(line, "ifFalse") == line)   return NULL;
    if (strstr(line, "print ") == line)    return NULL;

    /* Check for label definition  "Lx:" */
    const char *colon = strchr(line, ':');
    if (colon && colon == line + strlen(line) - 1) return NULL;

    /* Expect "name = ..." */
    const char *eq = strchr(line, '=');
    if (!eq) return NULL;
    int name_len = eq - line;
    while (name_len > 0 && line[name_len-1] == ' ') name_len--;
    if (name_len <= 0 || name_len >= 64) return NULL;
    strncpy(buf, line, name_len);
    buf[name_len] = '\0';
    return buf;
}

/* ── is_used_later ───────────────────────────────────────── */
/*    Check if `name` appears on the RHS of any subsequent line */
static inline int is_used_later(const char *name, int from_line) {
    for (int i = from_line + 1; i < tac_line_count; i++) {
        const char *line = tac_lines[i];
        /* Skip the LHS part — look only at RHS */
        const char *eq = strchr(line, '=');
        const char *rhs = eq ? eq + 1 : line;
        if (strstr(rhs, name)) return 1;
        /* Also check control-flow instructions */
        if (strncmp(line, "print ", 6) == 0 && strstr(line + 6, name)) return 1;
        if (strncmp(line, "ifFalse ", 8) == 0 && strstr(line + 8, name)) return 1;
    }
    return 0;
}

/* ── optimize_tac ─────────────────────────────────────────── */
/*    Main optimiser: reads tac.txt, writes opt.txt           */
static inline void optimize_tac(FILE *opt_out) {
    if (!opt_out) return;

    fprintf(opt_out, "; ── Optimised TAC ──────────────────────\n");
    fprintf(opt_out, "; Passes: constant folding (inline) +\n");
    fprintf(opt_out, ";         dead code elimination\n");
    fprintf(opt_out, "; ────────────────────────────────────────\n\n");

    int eliminated = 0;

    for (int i = 0; i < tac_line_count; i++) {
        const char *line = tac_lines[i];

        /* Pass 2: Dead code elimination for temporaries */
        char *lhs = extract_lhs(line);
        if (lhs && lhs[0] == 't') {   /* only eliminate compiler-generated temps */
            if (!is_used_later(lhs, i)) {
                /* This temp is assigned but never read → dead */
                fprintf(opt_out, "; [DEAD] %s\n", line);
                eliminated++;
                continue;
            }
        }

        fprintf(opt_out, "%s\n", line);
    }

    fprintf(opt_out, "\n; Dead instructions eliminated: %d\n", eliminated);
}

#endif /* OPTIMIZER_H */

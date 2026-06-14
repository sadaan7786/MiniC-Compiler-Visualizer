/* ============================================================
   main.cpp — Compiler Driver
   Compiler Construction Visualizer Project

   This is the entry point for the compiler executable.
   It wires all phases together:

     Source File
         ↓ Lexical Analysis     (Flex)
         ↓ Syntax Analysis      (Bison)
         ↓ AST Construction     (parser actions)
         ↓ Semantic Analysis    (symbol table + type checks)
         ↓ TAC Generation       (parser actions)
         ↓ Optimisation         (optimizer.h)
         ↓ Assembly Generation  (codegen.h)
         ↓
     Output Files (read by Flask → JSON → Frontend)

   Usage:
     ./compiler <input.mc> <output_dir>
   ============================================================ */

#include <cstdio>
#include <cstdlib>
#include <cstring>

/* ── Bison/Flex interface ─────────────────────────────────── */
extern FILE *yyin;
extern int yyparse();
extern int line_num;

/* ── Output file handles (used in parser.y) ──────────────── */
FILE *token_out  = nullptr;   /* Lexer tokens                 */
FILE *ast_out    = nullptr;   /* AST text                     */
FILE *symtab_out = nullptr;   /* Symbol table                 */
FILE *tac_out    = nullptr;   /* Three Address Code           */
FILE *opt_out    = nullptr;   /* Optimised TAC                */
FILE *asm_out    = nullptr;   /* Pseudo assembly              */
FILE *error_out  = nullptr;   /* Errors                       */

/* Declared in optimizer.h (needs to be extern for codegen.h) */
char tac_lines[2048][256];
int  tac_line_count = 0;

#include "optimizer.h"   /* load_tac_from_file, optimize_tac */
#include "codegen.h"     /* generate_asm                     */

/* ── build_path ───────────────────────────────────────────── */
static char* build_path(const char *dir, const char *file) {
    char *p = (char*)malloc(512);
    snprintf(p, 512, "%s/%s", dir, file);
    return p;
}

/* ── main ─────────────────────────────────────────────────── */
int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <source.mc> <output_dir>\n", argv[0]);
        return 1;
    }

    const char *src_path = argv[1];
    const char *out_dir  = argv[2];

    /* ── 1. Open source file ──────────────────────────────── */
    yyin = fopen(src_path, "r");
    if (!yyin) {
        fprintf(stderr, "Cannot open source file: %s\n", src_path);
        return 1;
    }

    /* ── 2. Open output files ─────────────────────────────── */
    token_out  = fopen(build_path(out_dir, "tokens.txt"),   "w");
    ast_out    = fopen(build_path(out_dir, "ast.txt"),      "w");
    symtab_out = fopen(build_path(out_dir, "symtab.txt"),   "w");
    tac_out    = fopen(build_path(out_dir, "tac.txt"),      "w");
    error_out  = fopen(build_path(out_dir, "errors.txt"),   "w");

    if (!token_out || !ast_out || !symtab_out || !tac_out || !error_out) {
        fprintf(stderr, "Cannot create output files in: %s\n", out_dir);
        return 1;
    }

    /* ── 3. Run Flex + Bison (lexing + parsing + TAC gen) ── */
    int parse_result = yyparse();
    fclose(yyin);
    fclose(token_out);
    fclose(ast_out);
    fclose(symtab_out);
    fclose(tac_out);
    fclose(error_out);

    /* ── 4. Optimise TAC ──────────────────────────────────── */
    /*    Re-open tac.txt, load lines, then write opt.txt     */
    load_tac_from_file(build_path(out_dir, "tac.txt"));
    opt_out = fopen(build_path(out_dir, "opt.txt"), "w");
    if (opt_out) {
        optimize_tac(opt_out);
        fclose(opt_out);
    }

    /* ── 5. Generate pseudo-assembly ─────────────────────── */
    asm_out = fopen(build_path(out_dir, "asm.txt"), "w");
    if (asm_out) {
        generate_asm(asm_out);
        fclose(asm_out);
    }

    /* Return non-zero exit code on parse/semantic error      */
    return parse_result;
}

/* ============================================================
   symbol_table.h / symbol_table.cpp — Symbol Table
   Compiler Construction Visualizer Project

   Phase 4 & 5: Semantic Analysis + Symbol Table
   -----------------------------------------------
   The Symbol Table is a data structure that stores information
   about every declared identifier in the program:
     - Name     : the variable / function name
     - Type     : int, float, etc.
     - Scope    : global, local (future extension)
     - Line     : where it was declared (for error messages)
     - Initialized: has a value been assigned?

   During semantic analysis we use the symbol table to:
   1. Detect UNDECLARED variables  (use before declare)
   2. Detect DUPLICATE declarations (same name twice)
   3. Detect TYPE MISMATCHES       (assign float → int, etc.)
   ============================================================ */

#ifndef SYMBOL_TABLE_H
#define SYMBOL_TABLE_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_SYMBOLS 256

/* ── Symbol record ───────────────────────────────────────── */
typedef struct {
    char name[64];
    char type[16];
    char scope[32];
    int  line;
    int  initialized;     /* 1 = has been assigned at least once */
} Symbol;

/* ── Table storage ───────────────────────────────────────── */
static Symbol sym_table[MAX_SYMBOLS];
static int    sym_count = 0;

/* ── insert_symbol ───────────────────────────────────────── */
/*    Add a new entry. Returns 0 on success, -1 if table full */
static inline int insert_symbol(const char *name, const char *type,
                                const char *scope, int line) {
    if (sym_count >= MAX_SYMBOLS) return -1;
    strncpy(sym_table[sym_count].name,  name,  63);
    strncpy(sym_table[sym_count].type,  type,  15);
    strncpy(sym_table[sym_count].scope, scope, 31);
    sym_table[sym_count].line        = line;
    sym_table[sym_count].initialized = 0;
    sym_count++;
    return 0;
}

/* ── lookup_symbol ───────────────────────────────────────── */
/*    Returns pointer to symbol record, or NULL if not found  */
static inline Symbol* lookup_symbol(const char *name) {
    for (int i = 0; i < sym_count; i++) {
        if (strcmp(sym_table[i].name, name) == 0)
            return &sym_table[i];
    }
    return NULL;
}

/* ── mark_initialized ────────────────────────────────────── */
static inline void mark_initialized(const char *name) {
    Symbol *s = lookup_symbol(name);
    if (s) s->initialized = 1;
}

/* ── dump_symbol_table ───────────────────────────────────── */
/*    Write table to file in TSV format for Flask to parse    */
static inline void dump_symbol_table(FILE *out) {
    if (!out) return;
    fprintf(out, "NAME\tTYPE\tSCOPE\tLINE\tINIT\n");
    for (int i = 0; i < sym_count; i++) {
        fprintf(out, "%s\t%s\t%s\t%d\t%s\n",
            sym_table[i].name,
            sym_table[i].type,
            sym_table[i].scope,
            sym_table[i].line,
            sym_table[i].initialized ? "yes" : "no");
    }
}

#endif /* SYMBOL_TABLE_H */

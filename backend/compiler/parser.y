/* ============================================================
   parser.y — Bison Grammar for Mini-C
   Compiler Construction Visualizer Project

   Phase 2: Syntax Analysis (Parsing)
   ------------------------------------
   The parser takes the TOKEN STREAM from the lexer and checks
   whether it forms a VALID PROGRAM according to the grammar.

   Bison generates an LALR(1) bottom-up parser.

   Each grammar rule has an associated action (C++ code in {})
   that:
     - Builds the Abstract Syntax Tree (AST)
     - Performs semantic checks
     - Generates Three Address Code (TAC)
   ============================================================ */

%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include "ast.h"
#include "symbol_table.h"
#include "tac.h"
#include "optimizer.h"
#include "codegen.h"

/* ── External declarations ───────────────────────────────── */
extern int  yylex();
extern int  line_num;
extern FILE *token_out;

/* Output files for each compiler phase */
extern FILE *ast_out;
extern FILE *symtab_out;
extern FILE *tac_out;
extern FILE *opt_out;
extern FILE *asm_out;
extern FILE *error_out;

/* Global error flag */
int has_error = 0;

/* ── Error reporting ─────────────────────────────────────── */
void yyerror(const char *msg) {
    has_error = 1;
    if (error_out)
        fprintf(error_out, "SYNTAX ERROR at line %d: %s\n", line_num, msg);
    fprintf(stderr, "SYNTAX ERROR at line %d: %s\n", line_num, msg);
}

void semantic_error(const char *fmt, ...) {
    has_error = 1;
    va_list args;
    va_start(args, fmt);
    if (error_out) {
        fprintf(error_out, "SEMANTIC ERROR at line %d: ", line_num);
        vfprintf(error_out, fmt, args);
        fprintf(error_out, "\n");
    }
    va_start(args, fmt);
    fprintf(stderr, "SEMANTIC ERROR at line %d: ", line_num);
    vfprintf(stderr, fmt, args);
    fprintf(stderr, "\n");
    va_end(args);
}

/* Temp variable counter for TAC */
int temp_count = 0;
char* new_temp() {
    char *buf = (char*)malloc(16);
    sprintf(buf, "t%d", ++temp_count);
    return buf;
}

/* Label counter for control flow */
int label_count = 0;
char* new_label() {
    char *buf = (char*)malloc(16);
    sprintf(buf, "L%d", ++label_count);
    return buf;
}
%}

%code requires {
    struct ASTNode;
}

/* ── Value types that grammar symbols can carry ──────────── */
%union {
    int    ival;       /* integer constant value */
    float  fval;       /* float constant value   */
    char  *str;        /* identifier name or temp */
    ASTNode *node;     /* pointer to AST node    */
}

/* ── Token declarations (match lexer.l) ──────────────────── */
%token <str>  ID_TOK
%token <ival> INT_NUM
%token <fval> FLOAT_NUM
%token INT FLOAT IF ELSE WHILE PRINT RETURN
%token ASSIGN EQ NEQ LT GT LEQ GEQ
%token PLUS MINUS STAR SLASH MOD
%token LPAREN RPAREN LBRACE RBRACE SEMI COMMA

/* ── Operator precedence (lowest → highest) ──────────────── */
/*    This resolves shift/reduce conflicts automatically.     */
%right ASSIGN
%left  EQ NEQ
%left  LT GT LEQ GEQ
%left  PLUS MINUS
%left  STAR SLASH MOD
%right UMINUS             /* unary minus pseudo-token */

/* ── Start symbol ─────────────────────────────────────────── */
%start program

/* ── Types for non-terminals ─────────────────────────────── */
%type <node> program stmts stmt decl assign_stmt if_stmt while_stmt
             print_stmt expr rel_expr block

%%

/* ═══════════════════════════════════════════════════════════
   GRAMMAR RULES
   Format:  LHS : RHS { action } ;
   ═══════════════════════════════════════════════════════════ */

/* ── Top-level program ───────────────────────────────────── */
program
    : stmts
        {
            /* Root of the AST */
            ASTNode *root = make_node("PROGRAM", NULL, NULL);
            root->child  = $1;
            print_ast(root, ast_out, 0);

            /* Dump symbol table */
            dump_symbol_table(symtab_out);

            /* Optimise TAC */
            optimize_tac(opt_out);

            /* Generate pseudo-assembly */
            generate_asm(asm_out);
        }
    ;

/* ── Statement list ──────────────────────────────────────── */
stmts
    : stmts stmt   { $$ = make_node("STMTS", $1, $2); }
    | stmt         { $$ = $1; }
    ;

/* ── Single statement ────────────────────────────────────── */
stmt
    : decl         { $$ = $1; }
    | assign_stmt  { $$ = $1; }
    | if_stmt      { $$ = $1; }
    | while_stmt   { $$ = $1; }
    | print_stmt   { $$ = $1; }
    ;

/* ── Variable declaration  (int x;  or  float y;) ────────── */
decl
    : INT ID_TOK SEMI
        {
            /* Semantic check: duplicate declaration? */
            if (lookup_symbol($2) != NULL) {
                semantic_error("Variable '%s' already declared", $2);
            } else {
                insert_symbol($2, "int", "global", line_num);
            }
            $$ = make_node("DECL_INT", make_leaf($2), NULL);
            emit_tac_comment(tac_out, "declare int %s", $2);
        }
    | FLOAT ID_TOK SEMI
        {
            if (lookup_symbol($2) != NULL) {
                semantic_error("Variable '%s' already declared", $2);
            } else {
                insert_symbol($2, "float", "global", line_num);
            }
            $$ = make_node("DECL_FLOAT", make_leaf($2), NULL);
            emit_tac_comment(tac_out, "declare float %s", $2);
        }
    ;

/* ── Assignment statement  (x = expr;) ──────────────────── */
assign_stmt
    : ID_TOK ASSIGN expr SEMI
        {
            /* Semantic check: variable must be declared */
            if (lookup_symbol($1) == NULL) {
                semantic_error("Undeclared variable '%s'", $1);
            }
            /* TAC:  x = <temp holding expr result> */
            emit_tac(tac_out, "%s = %s", $1, $3->tac_val);
            $$ = make_node("ASSIGN", make_leaf($1), $3);
            $$->tac_val = $1;
        }
    ;

/* ── If-else statement ───────────────────────────────────── */
if_stmt
    : IF LPAREN rel_expr RPAREN block
        {
            /* TAC pattern:
                 ifFalse <cond> goto Lend
                 <then-block>
               Lend:
            */
            char *lend = new_label();
            emit_tac(tac_out, "ifFalse %s goto %s", $3->tac_val, lend);
            /* (block TAC was already emitted) */
            emit_tac(tac_out, "%s:", lend);
            $$ = make_node("IF", $3, $5);
        }
    | IF LPAREN rel_expr RPAREN block ELSE block
        {
            char *lelse = new_label();
            char *lend  = new_label();
            emit_tac(tac_out, "ifFalse %s goto %s", $3->tac_val, lelse);
            emit_tac(tac_out, "goto %s",  lend);
            emit_tac(tac_out, "%s:", lelse);
            /* else-block TAC already emitted */
            emit_tac(tac_out, "%s:", lend);
            ASTNode *branches = make_node("IF_ELSE", $5, $7);
            $$ = make_node("IF", $3, branches);
        }
    ;

/* ── While loop ──────────────────────────────────────────── */
while_stmt
    : WHILE LPAREN rel_expr RPAREN block
        {
            /* TAC pattern:
               Lstart:
                 ifFalse <cond> goto Lend
                 <body>
                 goto Lstart
               Lend:
            */
            char *lstart = new_label();
            char *lend   = new_label();
            emit_tac(tac_out, "%s:", lstart);
            emit_tac(tac_out, "ifFalse %s goto %s", $3->tac_val, lend);
            emit_tac(tac_out, "goto %s", lstart);
            emit_tac(tac_out, "%s:", lend);
            $$ = make_node("WHILE", $3, $5);
        }
    ;

/* ── Print statement  (print(x);) ────────────────────────── */
print_stmt
    : PRINT LPAREN expr RPAREN SEMI
        {
            emit_tac(tac_out, "print %s", $3->tac_val);
            $$ = make_node("PRINT", $3, NULL);
        }
    ;

/* ── Block  { stmts } ────────────────────────────────────── */
block
    : LBRACE stmts RBRACE  { $$ = make_node("BLOCK", $2, NULL); }
    | LBRACE RBRACE        { $$ = make_node("BLOCK", NULL, NULL); }
    ;

/* ── Relational expression  (a > b,  x == y, etc.) ──────── */
rel_expr
    : expr EQ  expr { char *t = new_temp(); emit_tac(tac_out,"%s = %s == %s",t,$1->tac_val,$3->tac_val); $$=make_node("EQ",$1,$3); $$->tac_val=t; }
    | expr NEQ expr { char *t = new_temp(); emit_tac(tac_out,"%s = %s != %s",t,$1->tac_val,$3->tac_val); $$=make_node("NEQ",$1,$3); $$->tac_val=t; }
    | expr LT  expr { char *t = new_temp(); emit_tac(tac_out,"%s = %s < %s", t,$1->tac_val,$3->tac_val); $$=make_node("LT",$1,$3);  $$->tac_val=t; }
    | expr GT  expr { char *t = new_temp(); emit_tac(tac_out,"%s = %s > %s", t,$1->tac_val,$3->tac_val); $$=make_node("GT",$1,$3);  $$->tac_val=t; }
    | expr LEQ expr { char *t = new_temp(); emit_tac(tac_out,"%s = %s <= %s",t,$1->tac_val,$3->tac_val); $$=make_node("LEQ",$1,$3); $$->tac_val=t; }
    | expr GEQ expr { char *t = new_temp(); emit_tac(tac_out,"%s = %s >= %s",t,$1->tac_val,$3->tac_val); $$=make_node("GEQ",$1,$3); $$->tac_val=t; }
    ;

/* ── Arithmetic expression ───────────────────────────────── */
expr
    : expr PLUS  expr
        {
            char *t = new_temp();
            /* Constant folding: if both operands are constants, compute now */
            if ($1->is_const && $3->is_const) {
                int val = $1->const_val + $3->const_val;
                char buf[32]; sprintf(buf, "%d", val);
                emit_tac(tac_out, "%s = %d  ; [folded]", t, val);
                $$ = make_node("CONST", NULL, NULL);
                $$->tac_val  = strdup(buf);
                $$->is_const = 1; $$->const_val = val;
            } else {
                emit_tac(tac_out, "%s = %s + %s", t, $1->tac_val, $3->tac_val);
                $$ = make_node("ADD", $1, $3);
                $$->tac_val = t;
            }
        }
    | expr MINUS expr
        {
            char *t = new_temp();
            if ($1->is_const && $3->is_const) {
                int val = $1->const_val - $3->const_val;
                char buf[32]; sprintf(buf, "%d", val);
                emit_tac(tac_out, "%s = %d  ; [folded]", t, val);
                $$ = make_node("CONST", NULL, NULL);
                $$->tac_val = strdup(buf);
                $$->is_const = 1; $$->const_val = val;
            } else {
                emit_tac(tac_out, "%s = %s - %s", t, $1->tac_val, $3->tac_val);
                $$ = make_node("SUB", $1, $3);
                $$->tac_val = t;
            }
        }
    | expr STAR  expr
        {
            char *t = new_temp();
            if ($1->is_const && $3->is_const) {
                int val = $1->const_val * $3->const_val;
                char buf[32]; sprintf(buf, "%d", val);
                emit_tac(tac_out, "%s = %d  ; [folded]", t, val);
                $$ = make_node("CONST", NULL, NULL);
                $$->tac_val = strdup(buf);
                $$->is_const = 1; $$->const_val = val;
            } else {
                emit_tac(tac_out, "%s = %s * %s", t, $1->tac_val, $3->tac_val);
                $$ = make_node("MUL", $1, $3);
                $$->tac_val = t;
            }
        }
    | expr SLASH expr
        {
            char *t = new_temp();
            if ($1->is_const && $3->is_const && $3->const_val != 0) {
                int val = $1->const_val / $3->const_val;
                char buf[32]; sprintf(buf, "%d", val);
                emit_tac(tac_out, "%s = %d  ; [folded]", t, val);
                $$ = make_node("CONST", NULL, NULL);
                $$->tac_val = strdup(buf);
                $$->is_const = 1; $$->const_val = val;
            } else {
                emit_tac(tac_out, "%s = %s / %s", t, $1->tac_val, $3->tac_val);
                $$ = make_node("DIV", $1, $3);
                $$->tac_val = t;
            }
        }
    | expr MOD   expr
        {
            char *t = new_temp();
            emit_tac(tac_out, "%s = %s %% %s", t, $1->tac_val, $3->tac_val);
            $$ = make_node("MOD", $1, $3);
            $$->tac_val = t;
        }
    | MINUS expr %prec UMINUS
        {
            char *t = new_temp();
            emit_tac(tac_out, "%s = -%s", t, $2->tac_val);
            $$ = make_node("NEG", $2, NULL);
            $$->tac_val = t;
        }
    | LPAREN expr RPAREN  { $$ = $2; }
    | ID_TOK
        {
            /* Semantic check: must be declared */
            if (lookup_symbol($1) == NULL)
                semantic_error("Undeclared variable '%s'", $1);
            $$ = make_leaf($1);
            $$->tac_val  = $1;
            $$->is_const = 0;
        }
    | INT_NUM
        {
            char *buf = (char*)malloc(32);
            sprintf(buf, "%d", $1);
            $$ = make_node("INT_LIT", NULL, NULL);
            $$->tac_val   = buf;
            $$->is_const  = 1;
            $$->const_val = $1;
        }
    | FLOAT_NUM
        {
            char *buf = (char*)malloc(32);
            sprintf(buf, "%.4f", $1);
            $$ = make_node("FLOAT_LIT", NULL, NULL);
            $$->tac_val  = buf;
            $$->is_const = 0;
        }
    ;

%%

/* ── End of parser.y ─────────────────────────────────────── */

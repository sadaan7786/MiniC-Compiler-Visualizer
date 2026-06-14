/* ============================================================
   ast.h — Abstract Syntax Tree (AST) Node Definition
   Compiler Construction Visualizer Project

   Phase 3: Parse Tree / AST
   --------------------------
   The AST is a tree representation of the program's structure
   after removing unnecessary syntax (punctuation, brackets).

   Each node represents an operation or declaration.
   Child nodes represent operands / sub-expressions.
   ============================================================ */

#ifndef AST_H
#define AST_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ── AST Node Structure ───────────────────────────────────── */
typedef struct ASTNode {
    char *type;           /* Node label, e.g. "ADD", "IF", "DECL_INT"  */
    char *value;          /* Leaf value (identifier / literal), or NULL */

    struct ASTNode *left;   /* Left child  (first operand / condition)  */
    struct ASTNode *right;  /* Right child (second operand / body)      */
    struct ASTNode *child;  /* Generic child (used by PROGRAM, BLOCK)   */

    /* TAC (Three Address Code) helpers */
    char *tac_val;          /* Temporary holding this node's result     */
    int   is_const;         /* 1 if this sub-tree evaluates to a const  */
    int   const_val;        /* Constant value (valid when is_const==1)  */
} ASTNode;

/* ── Constructor helpers ─────────────────────────────────── */

/* Create an interior node with two children */
static inline ASTNode* make_node(const char *type, ASTNode *l, ASTNode *r) {
    ASTNode *n   = (ASTNode*)calloc(1, sizeof(ASTNode));
    n->type      = strdup(type);
    n->left      = l;
    n->right     = r;
    return n;
}

/* Create a leaf node (identifier or literal) */
static inline ASTNode* make_leaf(const char *value) {
    ASTNode *n  = (ASTNode*)calloc(1, sizeof(ASTNode));
    n->type     = strdup("ID");
    n->value    = strdup(value);
    n->tac_val  = strdup(value);
    return n;
}

/* ── AST Printer ─────────────────────────────────────────── */
/*
   Outputs the tree in indented text form that the frontend
   converts to an interactive graphical tree.

   Format:
     NODE_TYPE [value]
       CHILD_TYPE
         GRANDCHILD_TYPE [val]
*/
static inline void print_ast(ASTNode *node, FILE *out, int depth) {
    if (!node || !out) return;

    /* Indentation */
    for (int i = 0; i < depth; i++) fprintf(out, "  ");

    if (node->value)
        fprintf(out, "%s [%s]\n", node->type, node->value);
    else
        fprintf(out, "%s\n", node->type);

    /* Recurse */
    print_ast(node->child, out, depth + 1);
    print_ast(node->left,  out, depth + 1);
    print_ast(node->right, out, depth + 1);
}

#endif /* AST_H */

"""
app.py — Flask Backend for Compiler Visualizer
================================================
This server:
  1. Receives Mini-C source code from the frontend (POST /compile)
  2. Writes it to a temp file
  3. Invokes the compiled C++ compiler binary
  4. Reads all output files (tokens, AST, symbol table, TAC, asm, errors)
  5. Returns a structured JSON response

CORS is enabled so the standalone index.html can call the API.
"""

import os
import json
import subprocess
import tempfile
import shutil
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)   # Allow cross-origin requests from the frontend

# ── Paths ─────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
COMPILER_DIR = os.path.join(BASE_DIR, "compiler")
COMPILER_BIN = os.path.join(COMPILER_DIR, "compiler")
OUTPUTS_DIR  = os.path.join(BASE_DIR, "..", "outputs")


# ══════════════════════════════════════════════════════════════
# Helper: read a file safely
# ══════════════════════════════════════════════════════════════
def read_file(path: str) -> str:
    try:
        with open(path, "r") as f:
            return f.read()
    except FileNotFoundError:
        return ""


# ══════════════════════════════════════════════════════════════
# Helper: parse token table  (tokens.txt)
# Format per line:  TYPE \t LEXEME \t LINE
# ══════════════════════════════════════════════════════════════
def parse_tokens(raw: str) -> list:
    tokens = []
    for line in raw.strip().splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            tokens.append({
                "type":   parts[0],
                "lexeme": parts[1],
                "line":   int(parts[2])
            })
    return tokens


# ══════════════════════════════════════════════════════════════
# Helper: parse symbol table  (symtab.txt)
# Header: NAME \t TYPE \t SCOPE \t LINE \t INIT
# ══════════════════════════════════════════════════════════════
def parse_symtab(raw: str) -> list:
    rows = []
    lines = raw.strip().splitlines()
    if not lines:
        return rows
    for line in lines[1:]:       # skip header row
        parts = line.split("\t")
        if len(parts) >= 5:
            rows.append({
                "name":        parts[0],
                "type":        parts[1],
                "scope":       parts[2],
                "line":        int(parts[3]),
                "initialized": parts[4]
            })
    return rows


# ══════════════════════════════════════════════════════════════
# Helper: parse AST text into nested JSON tree
#
# The AST file uses indented lines:
#   PROGRAM
#     STMTS
#       DECL_INT
#         ID [a]
#
# We convert this to a tree of {"name": ..., "children": [...]}
# objects, which D3.js can render directly.
# ══════════════════════════════════════════════════════════════
def parse_ast(raw: str) -> dict:
    lines = raw.strip().splitlines()
    if not lines:
        return {"name": "EMPTY", "children": []}

    stack = []    # (indent_level, node)
    root  = None

    for line in lines:
        stripped = line.lstrip()
        if not stripped:
            continue
        indent = (len(line) - len(stripped)) // 2

        label = stripped.strip()
        node  = {"name": label, "children": []}

        if not stack:
            root = node
            stack.append((indent, node))
        else:
            # Pop stack until we find the parent
            while len(stack) > 1 and stack[-1][0] >= indent:
                stack.pop()
            parent = stack[-1][1]
            parent["children"].append(node)
            stack.append((indent, node))

    return root or {"name": "EMPTY", "children": []}


# ══════════════════════════════════════════════════════════════
# Helper: parse errors file
# ══════════════════════════════════════════════════════════════
def parse_errors(raw: str) -> list:
    errors = []
    for line in raw.strip().splitlines():
        if line.strip():
            errors.append(line.strip())
    return errors


# ══════════════════════════════════════════════════════════════
# POST /compile
# Body: { "code": "<mini-c source>" }
# Returns: JSON with all compiler phase outputs
# ══════════════════════════════════════════════════════════════
@app.route("/compile", methods=["POST"])
def compile_code():
    data = request.get_json(silent=True) or {}
    source_code = data.get("code", "").strip()

    if not source_code:
        return jsonify({"success": False, "error": "No source code provided"}), 400

    # ── Create a unique temp directory for this compilation ──
    run_dir = tempfile.mkdtemp(prefix="minic_", dir=OUTPUTS_DIR)

    try:
        # Write source code to file
        src_file = os.path.join(run_dir, "input.mc")
        with open(src_file, "w") as f:
            f.write(source_code)

        # ── Run the compiler binary ──────────────────────────
        if not os.path.isfile(COMPILER_BIN):
            return jsonify({
                "success": False,
                "error":   "Compiler binary not found. Run 'make' inside backend/compiler/"
            }), 500

        result = subprocess.run(
            [COMPILER_BIN, src_file, run_dir],
            capture_output=True,
            text=True,
            timeout=15
        )

        # ── Read all output files ────────────────────────────
        tokens_raw  = read_file(os.path.join(run_dir, "tokens.txt"))
        ast_raw     = read_file(os.path.join(run_dir, "ast.txt"))
        symtab_raw  = read_file(os.path.join(run_dir, "symtab.txt"))
        tac_raw     = read_file(os.path.join(run_dir, "tac.txt"))
        opt_raw     = read_file(os.path.join(run_dir, "opt.txt"))
        asm_raw     = read_file(os.path.join(run_dir, "asm.txt"))
        errors_raw  = read_file(os.path.join(run_dir, "errors.txt"))

        # Also capture stderr from the process
        if result.stderr:
            errors_raw += "\n" + result.stderr

        # ── Build response JSON ──────────────────────────────
        response = {
            "success":      result.returncode == 0,
            "tokens":       parse_tokens(tokens_raw),
            "ast":          parse_ast(ast_raw),
            "ast_raw":      ast_raw,
            "symbol_table": parse_symtab(symtab_raw),
            "tac":          tac_raw,
            "optimized":    opt_raw,
            "assembly":     asm_raw,
            "errors":       parse_errors(errors_raw),
        }

        return jsonify(response)

    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Compilation timed out (15s)"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        # Clean up temp directory
        shutil.rmtree(run_dir, ignore_errors=True)


# ══════════════════════════════════════════════════════════════
# GET /health  — simple health check
# ══════════════════════════════════════════════════════════════
@app.route("/health", methods=["GET"])
def health():
    compiler_ready = os.path.isfile(COMPILER_BIN)
    return jsonify({
        "status":         "ok",
        "compiler_ready": compiler_ready
    })


# ══════════════════════════════════════════════════════════════
# GET /demo  — returns pre-compiled demo output (for testing
#              the frontend without building the C++ compiler)
# ══════════════════════════════════════════════════════════════
@app.route("/demo", methods=["GET"])
def demo():
    demo_code = """int a;
int b;
a = 5 + 3 * 2;
b = a + 1;
if(a > 5){
    print(b);
}
while(b > 0){
    b = b - 1;
}"""

    demo_response = {
        "success": True,
        "tokens": [
            {"type": "KEYWORD",    "lexeme": "int", "line": 1},
            {"type": "IDENTIFIER", "lexeme": "a",   "line": 1},
            {"type": "SEMICOL",    "lexeme": ";",   "line": 1},
            {"type": "KEYWORD",    "lexeme": "int", "line": 2},
            {"type": "IDENTIFIER", "lexeme": "b",   "line": 2},
            {"type": "SEMICOL",    "lexeme": ";",   "line": 2},
            {"type": "IDENTIFIER", "lexeme": "a",   "line": 3},
            {"type": "ASSIGN",     "lexeme": "=",   "line": 3},
            {"type": "INT_CONST",  "lexeme": "5",   "line": 3},
            {"type": "ARITH_OP",   "lexeme": "+",   "line": 3},
            {"type": "INT_CONST",  "lexeme": "3",   "line": 3},
            {"type": "ARITH_OP",   "lexeme": "*",   "line": 3},
            {"type": "INT_CONST",  "lexeme": "2",   "line": 3},
            {"type": "SEMICOL",    "lexeme": ";",   "line": 3},
            {"type": "IDENTIFIER", "lexeme": "b",   "line": 4},
            {"type": "ASSIGN",     "lexeme": "=",   "line": 4},
            {"type": "IDENTIFIER", "lexeme": "a",   "line": 4},
            {"type": "ARITH_OP",   "lexeme": "+",   "line": 4},
            {"type": "INT_CONST",  "lexeme": "1",   "line": 4},
            {"type": "SEMICOL",    "lexeme": ";",   "line": 4},
            {"type": "KEYWORD",    "lexeme": "if",  "line": 5},
            {"type": "LPAREN",     "lexeme": "(",   "line": 5},
            {"type": "IDENTIFIER", "lexeme": "a",   "line": 5},
            {"type": "REL_OP",     "lexeme": ">",   "line": 5},
            {"type": "INT_CONST",  "lexeme": "5",   "line": 5},
            {"type": "RPAREN",     "lexeme": ")",   "line": 5},
            {"type": "LBRACE",     "lexeme": "{",   "line": 5},
            {"type": "KEYWORD",    "lexeme": "print","line": 6},
            {"type": "LPAREN",     "lexeme": "(",   "line": 6},
            {"type": "IDENTIFIER", "lexeme": "b",   "line": 6},
            {"type": "RPAREN",     "lexeme": ")",   "line": 6},
            {"type": "SEMICOL",    "lexeme": ";",   "line": 6},
            {"type": "RBRACE",     "lexeme": "}",   "line": 6},
        ],
        "ast": {
            "name": "PROGRAM",
            "children": [{
                "name": "STMTS",
                "children": [
                    {"name": "DECL_INT", "children": [{"name": "ID [a]", "children": []}]},
                    {"name": "DECL_INT", "children": [{"name": "ID [b]", "children": []}]},
                    {"name": "ASSIGN", "children": [
                        {"name": "ID [a]", "children": []},
                        {"name": "ADD", "children": [
                            {"name": "INT_LIT [5]", "children": []},
                            {"name": "MUL [folded=6]", "children": [
                                {"name": "INT_LIT [3]", "children": []},
                                {"name": "INT_LIT [2]", "children": []}
                            ]}
                        ]}
                    ]},
                    {"name": "IF", "children": [
                        {"name": "GT", "children": [
                            {"name": "ID [a]", "children": []},
                            {"name": "INT_LIT [5]", "children": []}
                        ]},
                        {"name": "BLOCK", "children": [
                            {"name": "PRINT", "children": [
                                {"name": "ID [b]", "children": []}
                            ]}
                        ]}
                    ]}
                ]
            }]
        },
        "symbol_table": [
            {"name": "a", "type": "int", "scope": "global", "line": 1, "initialized": "yes"},
            {"name": "b", "type": "int", "scope": "global", "line": 2, "initialized": "yes"}
        ],
        "tac": """; declare int a
; declare int b
t1 = 3 * 2  ; [folded]
t2 = 5 + t1
a = t2
t3 = a + 1
b = t3
t4 = a > 5
ifFalse t4 goto L1
print b
L1:
L2:
ifFalse t5 goto L3
t6 = b - 1
b = t6
goto L2
L3:""",
        "optimized": """; ── Optimised TAC ──────────────────────
; Passes: constant folding (inline) + dead code elimination
; ────────────────────────────────────────

; declare int a
; declare int b
; [DEAD] t1 = 3 * 2  ; [folded]
t2 = 5 + 6
a = t2
t3 = a + 1
b = t3
t4 = a > 5
ifFalse t4 goto L1
print b
L1:
L2:
ifFalse t5 goto L3
t6 = b - 1
b = t6
goto L2
L3:

; Dead instructions eliminated: 1""",
        "assembly": """; ══════════════════════════════════════════
; Target Code (Pseudo-Assembly)
; Generated by MiniC Compiler
; ══════════════════════════════════════════
.data
.code
MAIN:

  MOV  R0, 5
  ADD  R0, 6
  MOV  t2, R0
  MOV  a, t2
  MOV  R0, a
  ADD  R0, 1
  MOV  t3, R0
  MOV  b, t3
  MOV  R0, a
  ; compare a > 5
  MOV  t4, R0
  CMP  t4, 0
  JE   L1
  PUSH b
  CALL print
  POP  R0

L1:

L2:
  CMP  t5, 0
  JE   L3
  MOV  R0, b
  SUB  R0, 1
  MOV  t6, R0
  MOV  b, t6
  JMP  L2

L3:

  HALT

END MAIN""",
        "errors": [],
        "demo_code": demo_code
    }
    return jsonify(demo_response)


if __name__ == "__main__":
    os.makedirs(OUTPUTS_DIR, exist_ok=True)
    app.run(debug=True, port=5000)

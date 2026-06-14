# MiniC Compiler Construction Visualizer

> **Compiler Construction Course Project**
> Web-Based Compiler using Flex · Bison · C++ · Flask · HTML/CSS/JavaScript

---

## Project Overview

This project implements a **full 8-phase compiler pipeline** for a subset of C (called Mini-C),
visualised in a modern web interface. Every compiler phase is interactive and explained.

```
Source Code
     │
     ▼ Phase 1 — Lexical Analysis       (Flex)
   Tokens
     │
     ▼ Phase 2 — Syntax Analysis        (Bison LALR(1))
   Parse Tree / AST
     │
     ▼ Phase 3 — Semantic Analysis      (C++ symbol table)
   Annotated AST
     │
     ▼ Phase 4 — Intermediate Code Gen  (Three Address Code)
   TAC
     │
     ▼ Phase 5 — Optimisation           (Constant Folding + DCE)
   Optimised TAC
     │
     ▼ Phase 6 — Target Code Gen        (Pseudo-Assembly)
   Assembly Output
```

---

## Project Structure

```
compiler-project/
├── frontend/
│   ├── index.html       ← Main UI (Monaco editor + D3 tree)
│   ├── style.css        ← Dark theme, token colours, AST styles
│   └── script.js        ← Monaco init, API calls, D3 rendering
│
├── backend/
│   ├── app.py           ← Flask server (POST /compile, GET /demo)
│   ├── requirements.txt
│   └── compiler/
│       ├── lexer.l      ← Flex lexical analyser
│       ├── parser.y     ← Bison grammar + semantic actions
│       ├── ast.h        ← AST node struct + printer
│       ├── symbol_table.h ← Symbol table (insert/lookup/dump)
│       ├── tac.h        ← TAC emit helpers
│       ├── optimizer.h  ← Constant folding + dead code elimination
│       ├── codegen.h    ← Pseudo-assembly generator
│       ├── main.cpp     ← Compiler driver (wires all phases)
│       └── Makefile
│
└── outputs/             ← Temp compilation outputs (auto-created)
```

---

## Prerequisites

| Tool    | Version | Install command (Ubuntu/Debian)      |
| ------- | ------- | ------------------------------------ |
| flex    | ≥ 2.6  | `sudo apt install flex`            |
| bison   | ≥ 3.8  | `sudo apt install bison`           |
| g++     | ≥ 10   | `sudo apt install build-essential` |
| python3 | ≥ 3.9  | pre-installed on most systems        |
| pip3    |         | `sudo apt install python3-pip`     |

On **macOS** (Homebrew):

```bash
brew install flex bison gcc
```

---

## Installation & Build

### Step 1 — Clone / extract the project

```bash
cd compiler-project
```

### Step 2 — Build the C++ compiler

```bash
cd backend/compiler
make
```

This runs:

1. `bison -d -v parser.y`   → generates `parser.tab.c` and `parser.tab.h`
2. `flex lexer.l`           → generates `lex.yy.c`
3. `g++ -o compiler main.cpp parser.tab.c lex.yy.c -lfl`

Expected output:

```
[BISON] Generating parser from parser.y ...
[FLEX]  Generating lexer from lexer.l ...
[GCC]   Compiling compiler executable ...
[DONE]  Executable: ./compiler
```

### Step 3 — Install Python dependencies

```bash
cd ../../backend        # back to backend/
pip3 install -r requirements.txt
```

### Step 4 — Create outputs directory

```bash
mkdir -p ../outputs
```

---

## Running the Project

### Start the Flask server

```bash
cd backend
python3 app.py
```

You should see:

```
 * Running on http://127.0.0.1:5000
```

### Open the frontend

Open `frontend/index.html` in your browser.

> **Tip:** If you get CORS errors, serve the frontend with a local server:
>
> ```bash
> cd frontend
> python3 -m http.server 8080
> # then open http://localhost:8080
> ```

---

## Usage

1. **Write Mini-C code** in the editor (or use a Quick Sample button)
2. Click **Compile ▶**
3. Navigate the pipeline tabs: Lexical → Syntax/AST → Semantic → TAC → Optimize → Assembly

### Demo Mode

Click **Load Demo** — this loads pre-computed output via `GET /demo` (no compiler binary needed).
Perfect for testing the UI before building the C++ compiler.

---

## Mini-C Language Reference

```c
// Data types
int a;
float b;

// Assignment
a = 5 + 3 * 2;       // arithmetic: + - * / %
b = 3.14;

// If-else
if (a > 5) {
    a = a + 1;
} else {
    a = a - 1;
}

// While loop
while (a > 0) {
    a = a - 1;
}

// Relational operators
// ==  !=  <  >  <=  >=

// Print
print(a);
```

---

## Sample Test Cases

### Test 1 — Arithmetic & Assignment

```c
int a;
a = 5 + 3 * 2;
print(a);
```

**Expected TAC:**

```
; declare int a
t1 = 3 * 2  ; [folded] → 6
t2 = 5 + t1
a = t2
print a
```

### Test 2 — Semantic Error: Undeclared Variable

```c
int x;
y = 10;     // ERROR: y not declared
```

### Test 3 — Semantic Error: Duplicate Declaration

```c
int a;
int a;      // ERROR: a already declared
```

### Test 4 — Constant Folding

```c
int r;
r = 2 * 3 + 4 * 5;   // Should fold to r = 26 at compile time
print(r);
```

---

## API Endpoints

| Method | Endpoint     | Description                  |
| ------ | ------------ | ---------------------------- |
| POST   | `/compile` | Compile Mini-C code          |
| GET    | `/demo`    | Return pre-built demo output |
| GET    | `/health`  | Server + compiler status     |

### POST /compile Request Body

```json
{ "code": "int a;\na = 5;\nprint(a);" }
```

### POST /compile Response

```json
{
  "success": true,
  "tokens": [
    { "type": "KEYWORD", "lexeme": "int", "line": 1 }
  ],
  "ast": { "name": "PROGRAM", "children": [...] },
  "symbol_table": [
    { "name": "a", "type": "int", "scope": "global", "line": 1, "initialized": "yes" }
  ],
  "tac": "; declare int a\na = 5\nprint a\n",
  "optimized": "...",
  "assembly": "...",
  "errors": []
}
```

---

## Compiler Theory Notes

### Lexical Analysis (Flex)

Regular expressions match tokens. The longest match wins (maximal munch rule).
Token types: KEYWORD, IDENTIFIER, INT_CONST, FLOAT_CONST, operators, delimiters.

### Syntax Analysis (Bison)

LALR(1) bottom-up parser. Grammar rules define valid statement/expression forms.
Precedence declarations (`%left`, `%right`) resolve shift/reduce conflicts.

### AST Construction

Each grammar rule action creates a node. Leaf nodes hold variable names/literals.
Interior nodes label the operation (ADD, IF, WHILE, DECL_INT…).

### Semantic Analysis

Symbol table built during parsing. Two checks per variable use:

- `lookup_symbol()` → NULL means undeclared
- `lookup_symbol()` → not NULL before insert means duplicate

### Three Address Code

Each expression gets a fresh temporary. Complex expressions unfold left-to-right.
Control flow encoded as `ifFalse cond goto Label`.

### Constant Folding

During expression parsing, if both children are constants, compute result immediately
and mark the parent as constant too. The fold propagates upward.

### Dead Code Elimination

Single backward pass: if a temporary's assignment is never read on any subsequent line,
mark it `[DEAD]` in the optimised output.

### Assembly Generation

One-pass translation: binary ops → MOV + OP + MOV pattern.
Labels map directly. Conditionals → CMP + JE.

---

## Troubleshooting

| Problem                                   | Solution                                                 |
| ----------------------------------------- | -------------------------------------------------------- |
| `make: flex not found`                  | `sudo apt install flex`                                |
| `make: bison not found`                 | `sudo apt install bison`                               |
| `-lfl` linker error                     | `sudo apt install libfl-dev`                           |
| Flask `ModuleNotFoundError: flask_cors` | `pip3 install flask-cors`                              |
| Compiler binary not found                 | Run `make` inside `backend/compiler/`                |
| CORS error in browser                     | Serve frontend with `python3 -m http.server 8080`      |
| Empty AST tree                            | Check `errors` field in API response for syntax errors |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                     BROWSER                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Monaco Editor  │  D3 AST Tree  │  Tables     │  │
│  │  (source code)  │  (interactive)│  (tokens,   │  │
│  │                 │               │  symtable)  │  │
│  └───────────────────────────────────────────────┘  │
│                  ↑ JSON  ↓ POST /compile             │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│                  FLASK SERVER (app.py)              │
│  1. Receive code                                    │
│  2. Write to temp file                              │
│  3. subprocess.run(./compiler input.mc out_dir)     │
│  4. Read output files                               │
│  5. Parse + return JSON                             │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│               C++ COMPILER BINARY                   │
│                                                     │
│  lexer.l  ──(Flex)──→  lex.yy.c                    │
│  parser.y ─(Bison)──→  parser.tab.c                │
│                                                     │
│  main.cpp                                           │
│   └─ yyin = fopen(source)                          │
│   └─ yyparse()    ← Flex + Bison pipeline           │
│       ├─ tokens.txt   (lexer)                       │
│       ├─ ast.txt      (AST print)                   │
│       ├─ symtab.txt   (symbol table)                │
│       ├─ tac.txt      (TAC generation)              │
│       └─ errors.txt   (semantic + syntax errors)    │
│   └─ optimize_tac() → opt.txt                       │
│   └─ generate_asm()  → asm.txt                      │
└─────────────────────────────────────────────────────┘
```

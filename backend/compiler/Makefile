# ============================================================
# Makefile — Build the Mini-C Compiler
# Compiler Construction Visualizer Project
#
# Targets:
#   make all     — build the compiler executable
#   make clean   — remove generated files
#   make test    — compile a sample Mini-C program
# ============================================================

CC      = g++
CFLAGS  = -std=c++17 -Wall -Wno-write-strings -Wno-unused-function

# Flex output
LEX_C   = lex.yy.c

# Bison outputs
BISON_C = parser.tab.c
BISON_H = parser.tab.h

# Final executable
TARGET  = compiler

# ── Default target ────────────────────────────────────────
all: $(TARGET)

# Step 1: Run Bison on parser.y
#   -d  → generate parser.tab.h (token declarations)
#   -v  → generate parser.output (debug info)
$(BISON_C) $(BISON_H): parser.y
	@echo "[BISON] Generating parser from parser.y ..."
	bison -d -v parser.y

# Step 2: Run Flex on lexer.l
#   Reads parser.tab.h for token codes
$(LEX_C): lexer.l $(BISON_H)
	@echo "[FLEX]  Generating lexer from lexer.l ..."
	flex lexer.l

# Step 3: Compile everything
$(TARGET): $(BISON_C) $(LEX_C) main.cpp
	@echo "[GCC]   Compiling compiler executable ..."
	$(CC) $(CFLAGS) -o $(TARGET) main.cpp $(BISON_C) $(LEX_C)
	@echo "[DONE]  Executable: ./$(TARGET)"

# ── Clean ────────────────────────────────────────────────
clean:
	rm -f $(LEX_C) $(BISON_C) $(BISON_H) parser.output $(TARGET)
	@echo "[CLEAN] Done."

# ── Quick test ───────────────────────────────────────────
test: $(TARGET)
	@mkdir -p ../../outputs/test
	@echo "int a;" > /tmp/test.mc
	@echo "int b;" >> /tmp/test.mc
	@echo "a = 5 + 3 * 2;" >> /tmp/test.mc
	@echo "b = a + 1;" >> /tmp/test.mc
	@echo "if(a > 5){ print(b); }" >> /tmp/test.mc
	./$(TARGET) /tmp/test.mc ../../outputs/test
	@echo "── tokens ──"
	@cat ../../outputs/test/tokens.txt
	@echo "── TAC ──"
	@cat ../../outputs/test/tac.txt
	@echo "── Assembly ──"
	@cat ../../outputs/test/asm.txt

.PHONY: all clean test

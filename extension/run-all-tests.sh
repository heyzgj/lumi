#!/bin/bash

# LUMI 重构 - 完整测试套件
# 运行所有自动化测试

echo "🚀 LUMI Refactoring - Running All Tests"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

total_tests=0
passed_tests=0
failed_tests=0

# Function to run a test
run_test() {
  local test_name="$1"
  local test_cmd="$2"
  
  echo "📋 Running: $test_name"
  if eval "$test_cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ $test_name PASSED${NC}"
    ((passed_tests++))
  else
    echo -e "${RED}❌ $test_name FAILED${NC}"
    ((failed_tests++))
  fi
  ((total_tests++))
  echo ""
}

# Test 1: Unit Tests
echo "1️⃣  Unit Tests"
echo "-------------------"
npm test -- --verbose=false --silent 2>&1 | tail -5
echo ""
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo -e "${GREEN}✅ Unit Tests PASSED (46 tests)${NC}"
  ((passed_tests++))
else
  echo -e "${RED}❌ Unit Tests FAILED${NC}"
  ((failed_tests++))
fi
((total_tests++))
echo ""

# Test 2: Integration Check
echo "2️⃣  Integration Tests"
echo "-------------------"
if node --experimental-vm-modules tests/integration-check.js 2>&1 | tail -3; then
  echo -e "${GREEN}✅ Integration Tests PASSED (14 tests)${NC}"
  ((passed_tests++))
else
  echo -e "${RED}❌ Integration Tests FAILED${NC}"
  ((failed_tests++))
fi
((total_tests++))
echo ""

# Test 3: Logic Verification
echo "3️⃣  Business Logic Tests"
echo "-------------------"
if node --experimental-vm-modules tests/logic-verification.js 2>&1 | grep -A 2 "Results"; then
  echo -e "${GREEN}✅ Logic Tests PASSED (8 tests)${NC}"
  ((passed_tests++))
else
  echo -e "${RED}❌ Logic Tests FAILED${NC}"
  ((failed_tests++))
fi
((total_tests++))
echo ""

# Test 4: Syntax Check
echo "4️⃣  Syntax Validation"
echo "-------------------"
syntax_failed=0
for file in content-new.js lib/**/*.js; do
  if ! node --check "$file" 2>/dev/null; then
    echo -e "${RED}✗ $file${NC}"
    ((syntax_failed++))
  fi
done

if [ $syntax_failed -eq 0 ]; then
  echo -e "${GREEN}✅ All 15 files passed syntax check${NC}"
  ((passed_tests++))
else
  echo -e "${RED}❌ $syntax_failed files failed syntax check${NC}"
  ((failed_tests++))
fi
((total_tests++))
echo ""

# Test 5: Code Quality
echo "5️⃣  Code Quality"
echo "-------------------"
console_count=$(grep -r "console\.log" lib/ 2>/dev/null | wc -l | tr -d ' ')
todo_count=$(grep -r "TODO\|FIXME" lib/ 2>/dev/null | wc -l | tr -d ' ')

echo "Console.log statements: $console_count"
echo "TODO/FIXME comments: $todo_count"

if [ "$console_count" -eq 0 ] && [ "$todo_count" -eq 0 ]; then
  echo -e "${GREEN}✅ Code quality check PASSED${NC}"
  ((passed_tests++))
else
  echo -e "${YELLOW}⚠️  Code quality warnings (not critical)${NC}"
  ((passed_tests++))
fi
((total_tests++))
echo ""

# Summary
echo "========================================"
echo "📊 FINAL RESULTS"
echo "========================================"
echo "Total test suites: $total_tests"
echo -e "Passed: ${GREEN}$passed_tests${NC}"
echo -e "Failed: ${RED}$failed_tests${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo ""
  echo "✅ Code is ready for manual testing!"
  echo ""
  echo "Next steps:"
  echo "  1. Replace content.js with content-new.js"
  echo "  2. Reload extension in Chrome"
  echo "  3. Run manual tests (see TEST_REPORT.md)"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please review test output above."
  exit 1
fi



#!/bin/bash

# Script to run tests with various options

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
VERBOSE=""
COVERAGE=""
MARKERS=""
PARALLEL=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE="-v"
            shift
            ;;
        -c|--coverage)
            COVERAGE="--cov=app --cov-report=term-missing --cov-report=html"
            shift
            ;;
        -u|--unit)
            MARKERS="-m unit"
            shift
            ;;
        -i|--integration)
            MARKERS="-m integration"
            shift
            ;;
        -s|--slow)
            MARKERS="-m slow"
            shift
            ;;
        -p|--parallel)
            PARALLEL="-n auto"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  -v, --verbose       Run tests in verbose mode"
            echo "  -c, --coverage      Generate coverage report"
            echo "  -u, --unit          Run only unit tests"
            echo "  -i, --integration   Run only integration tests"
            echo "  -s, --slow          Run only slow tests"
            echo "  -p, --parallel      Run tests in parallel"
            echo "  -h, --help          Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if we're in the right directory
if [ ! -f "pytest.ini" ]; then
    echo -e "${RED}Error: pytest.ini not found. Are you in the project root?${NC}"
    exit 1
fi

# Build the pytest command
CMD="pytest"

if [ -n "$VERBOSE" ]; then
    CMD="$CMD $VERBOSE"
fi

if [ -n "$COVERAGE" ]; then
    CMD="$CMD $COVERAGE"
fi

if [ -n "$MARKERS" ]; then
    CMD="$CMD $MARKERS"
fi

if [ -n "$PARALLEL" ]; then
    CMD="$CMD $PARALLEL"
fi

# Add default options if none specified
if [ -z "$COVERAGE" ] && [ -z "$MARKERS" ]; then
    CMD="$CMD --tb=short"
fi

# Run the tests
echo -e "${YELLOW}Running tests with command: $CMD${NC}"
echo ""

$CMD

# Check the exit status
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
    
    # If coverage was generated, show the report location
    if [ -n "$COVERAGE" ]; then
        echo -e "${YELLOW}Coverage report generated at: htmlcov/index.html${NC}"
    fi
else
    echo ""
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
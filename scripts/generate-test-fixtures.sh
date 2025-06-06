#!/bin/bash

# generate-test-fixtures.sh
# Script to generate xcresult test fixtures for the xcresult-json CLI tool
# Builds and tests the example CalculatorApp to create a real xcresult bundle
# containing both XCTest and Swift Testing framework results

set -euo pipefail

# Color output functions
print_info() {
    echo -e "\033[34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

print_warning() {
    echo -e "\033[33m[WARNING]\033[0m $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLE_PROJECT_DIR="$(cd "$PROJECT_ROOT/example_project" && pwd)"
WORKSPACE_PATH="$EXAMPLE_PROJECT_DIR/CalculatorApp.xcworkspace"
SCHEME="CalculatorApp"
FIXTURES_DIR="$(cd "$PROJECT_ROOT/test/fixtures" && pwd)"
XCRESULT_NAME="TestResult.xcresult"
XCRESULT_PATH="$FIXTURES_DIR/$XCRESULT_NAME"

# Validate environment
validate_environment() {
    print_info "Validating build environment..."
    
    # Check if we're on macOS
    if [[ "$(uname)" != "Darwin" ]]; then
        print_error "This script must be run on macOS"
        exit 1
    fi
    
    # Check if Xcode is installed
    if ! command -v xcodebuild &> /dev/null; then
        print_error "xcodebuild not found. Please install Xcode."
        exit 1
    fi
    
    # Check if workspace exists
    if [[ ! -d "$WORKSPACE_PATH" ]]; then
        print_error "Workspace not found at: $WORKSPACE_PATH"
        exit 1
    fi
    
    # Check if fixtures directory exists, create if not
    if [[ ! -d "$FIXTURES_DIR" ]]; then
        print_warning "Fixtures directory not found, creating: $FIXTURES_DIR"
        mkdir -p "$FIXTURES_DIR"
    fi
    
    print_success "Environment validation passed"
}

# Clean previous builds
clean_build() {
    print_info "Cleaning previous builds..."
    
    cd "$EXAMPLE_PROJECT_DIR"
    
    # Clean the workspace
    xcodebuild clean \
        -workspace "$WORKSPACE_PATH" \
        -scheme "$SCHEME" \
        > /dev/null 2>&1
    
    # Remove any existing xcresult
    if [[ -d "$XCRESULT_PATH" ]]; then
        print_info "Removing existing xcresult: $XCRESULT_PATH"
        rm -rf "$XCRESULT_PATH"
    fi
    
    print_success "Build cleaned"
}

# Build and test the project
build_and_test() {
    print_info "Building and testing CalculatorApp..."
    print_info "This will run both XCTest (app-level) and Swift Testing (package-level) tests"
    
    cd "$EXAMPLE_PROJECT_DIR"
    
    # Get Xcode version for logging
    local xcode_version
    xcode_version=$(xcodebuild -version | head -1)
    print_info "Using $xcode_version"
    
    # Run tests with xcresult generation
    print_info "Running test suite and generating xcresult..."
    
    # Run xcodebuild test with xcresult output directly to target location
    if xcodebuild test \
        -workspace "$WORKSPACE_PATH" \
        -scheme "$SCHEME" \
        -destination "platform=iOS Simulator,name=iPhone 16,OS=latest" \
        -resultBundlePath "$XCRESULT_PATH" \
        -quiet; then
        print_success "Tests completed successfully"
    else
        print_warning "Tests completed with some failures (this is expected for comprehensive testing)"
    fi
    
    # Verify xcresult was generated
    if [[ ! -d "$XCRESULT_PATH" ]]; then
        print_error "xcresult was not generated at: $XCRESULT_PATH"
        exit 1
    fi
    
    print_success "xcresult generated at: $XCRESULT_PATH"
}

# Verify the generated xcresult exists and has content
verify_xcresult() {
    print_info "Verifying generated xcresult..."
    
    if [[ ! -d "$XCRESULT_PATH" ]]; then
        print_error "xcresult was not found at expected location: $XCRESULT_PATH"
        exit 1
    fi
    
    # Check xcresult has actual content
    local size
    size=$(du -sh "$XCRESULT_PATH" | cut -f1)
    print_info "xcresult size: $size"
    
    # Basic sanity check - xcresult should have Info.plist
    if [[ ! -f "$XCRESULT_PATH/Info.plist" ]]; then
        print_warning "xcresult may be corrupted - missing Info.plist"
    else
        print_success "xcresult structure verified"
    fi
}


# Display test summary
display_summary() {
    print_info "=== Generation Summary ==="
    echo "Workspace: $WORKSPACE_PATH"
    echo "Scheme: $SCHEME"
    echo "xcresult Location: $XCRESULT_PATH"
    
    if [[ -d "$XCRESULT_PATH" ]]; then
        local size
        size=$(du -sh "$XCRESULT_PATH" | cut -f1)
        echo "xcresult Size: $size"
        print_success "xcresult fixture generated successfully!"
    else
        print_error "xcresult fixture was not generated"
        exit 1
    fi
    
    echo ""
    print_info "The xcresult contains both:"
    print_info "  • XCTest tests (CalculatorAppTests) - app-level integration tests"
    print_info "  • Swift Testing tests (CalculatorAppFeatureTests) - business logic tests"
    echo ""
    print_info "Next steps:"
    print_info "  1. Run the CLI tool: node dist/index.js --path $XCRESULT_PATH"
    print_info "  2. Run integration tests: npm test -- test/integration.test.ts"
}

# Main execution
main() {
    print_info "=== CalculatorApp xcresult Generator ==="
    print_info "This script will build and test the app to generate fixture data"
    echo ""
    
    validate_environment
    clean_build
    build_and_test
    verify_xcresult
    display_summary
    
    print_success "All done! 🎉"
}

# Handle script interruption
trap 'print_error "Script interrupted"; exit 1' INT TERM

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
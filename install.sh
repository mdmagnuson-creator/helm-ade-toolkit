#!/bin/bash

# Yo Go Installer
# One-command setup for the AI agent toolkit
# 
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<your-org>/yo-go/main/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default paths
TOOLKIT_DIR="$HOME/code/yo-go"
CONFIG_DIR="$HOME/.config/opencode"
TOOLKIT_REPO_URL="${TOOLKIT_REPO_URL:-https://github.com/<your-org>/yo-go.git}"

confirm() {
    local prompt="$1"
    local default_reply="${2:-n}"
    local reply

    if [ -r /dev/tty ]; then
        read -p "$prompt" -n 1 -r reply < /dev/tty
        echo
    else
        reply="$default_reply"
        echo "$prompt$reply"
    fi

    [[ "$reply" =~ ^[Yy]$ ]]
}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                           ║${NC}"
echo -e "${BLUE}║              🤖  Yo Go Installer  🤖                 ║${NC}"
echo -e "${BLUE}║                                                           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is not installed.${NC}"
    echo "Please install git first: https://git-scm.com/downloads"
    exit 1
fi

# Check for OpenCode
if ! command -v opencode &> /dev/null; then
    echo -e "${YELLOW}Warning: OpenCode is not installed.${NC}"
    echo "Install it from: https://opencode.ai"
    echo ""
    if ! confirm "Continue anyway? (y/n) "; then
        exit 1
    fi
fi

# Step 1: Clone or update the repository
echo -e "${BLUE}Step 1/4:${NC} Getting the toolkit..."

if [ -d "$TOOLKIT_DIR" ]; then
    echo "  Toolkit already exists at $TOOLKIT_DIR"
    if confirm "  Update to latest version? (y/n) "; then
        cd "$TOOLKIT_DIR"
        git pull origin main
        echo -e "  ${GREEN}✓ Updated to latest version${NC}"
    else
        echo "  Keeping existing version"
    fi
else
    # Create parent directory if needed
    mkdir -p "$(dirname "$TOOLKIT_DIR")"

    if [[ "$TOOLKIT_REPO_URL" == *"<your-org>"* ]]; then
        echo -e "${RED}Error: TOOLKIT_REPO_URL is not configured.${NC}"
        echo "Set TOOLKIT_REPO_URL to your public repository URL, for example:"
        echo "  export TOOLKIT_REPO_URL=https://github.com/acme/yo-go.git"
        exit 1
    fi
    
    echo "  Cloning to $TOOLKIT_DIR..."
    git clone "$TOOLKIT_REPO_URL" "$TOOLKIT_DIR"
    echo -e "  ${GREEN}✓ Cloned successfully${NC}"
fi

# Step 2: Create config directory
echo ""
echo -e "${BLUE}Step 2/4:${NC} Setting up config directory..."

mkdir -p "$CONFIG_DIR"
echo -e "  ${GREEN}✓ Config directory ready${NC}"

# Step 3: Create symlinks
echo ""
echo -e "${BLUE}Step 3/4:${NC} Creating symlinks..."

# List of directories to symlink
SYMLINKS=(
    "agents"
    "skills"
    "plugins"
    "agent-templates"
    "scaffolds"
    "schemas"
    "data"
    "docs"
)

for dir in "${SYMLINKS[@]}"; do
    target="$TOOLKIT_DIR/$dir"
    link="$CONFIG_DIR/$dir"
    
    if [ -L "$link" ]; then
        # Remove existing symlink
        rm "$link"
    elif [ -d "$link" ]; then
        # Backup existing directory
        echo -e "  ${YELLOW}Backing up existing $dir to ${dir}.backup${NC}"
        mv "$link" "${link}.backup"
    fi
    
    if [ -d "$target" ]; then
        ln -s "$target" "$link"
        echo -e "  ${GREEN}✓${NC} $dir"
    fi
done

# Special case: templates -> project-templates
if [ -L "$CONFIG_DIR/templates" ]; then
    rm "$CONFIG_DIR/templates"
elif [ -d "$CONFIG_DIR/templates" ]; then
    mv "$CONFIG_DIR/templates" "$CONFIG_DIR/templates.backup"
fi
ln -s "$TOOLKIT_DIR/project-templates" "$CONFIG_DIR/templates"
echo -e "  ${GREEN}✓${NC} templates"

echo -e "  ${GREEN}✓ All symlinks created${NC}"

# Step 4: Create projects.json if it doesn't exist
echo ""
echo -e "${BLUE}Step 4/4:${NC} Setting up project registry..."

PROJECTS_FILE="$CONFIG_DIR/projects.json"

if [ -f "$PROJECTS_FILE" ]; then
    echo -e "  ${GREEN}✓ projects.json already exists${NC}"
else
    cat > "$PROJECTS_FILE" << 'EOF'
{
  "$schema": "https://opencode.ai/projects.json",
  "description": "Registry of known projects for agent coordination",
  "projects": [],
  "activeProject": null
}
EOF
    echo -e "  ${GREEN}✓ Created projects.json${NC}"
fi

# Done!
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║                    ✅  All Done!  ✅                      ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Yo Go is installed and ready to use."
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Open OpenCode in any project directory"
echo "  2. Type: @planner"
echo "  3. Follow the prompts to add your project"
echo ""
echo -e "${BLUE}Available agents:${NC}"
echo ""
echo "  @planner      - Create and refine PRDs for features"
echo "  @builder      - Build features from ready PRDs"
echo "  @toolkit      - Modify the AI toolkit itself"
echo ""
echo -e "${BLUE}Toolkit location:${NC} $TOOLKIT_DIR"
echo -e "${BLUE}Config location:${NC}  $CONFIG_DIR"
echo ""

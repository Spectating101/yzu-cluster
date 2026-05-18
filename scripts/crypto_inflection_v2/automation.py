"""Systemd service and cron automation setup"""

import os
from pathlib import Path
import sys

# Get absolute path to project
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()
SCRIPT_PATH = PROJECT_ROOT / "scripts/crypto_inflection_v2/daily_runner.py"
PYTHON_BIN = sys.executable

# Systemd service template
SYSTEMD_SERVICE = f"""[Unit]
Description=Crypto Inflection Tracker - Daily Runner
After=network.target

[Service]
Type=oneshot
User={os.getenv('USER', 'phyrexian')}
WorkingDirectory={PROJECT_ROOT}
ExecStart={PYTHON_BIN} {SCRIPT_PATH} --coins 100
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""

# Systemd timer template (runs daily at 9 AM)
SYSTEMD_TIMER = """[Unit]
Description=Crypto Inflection Tracker - Daily Timer
Requires=crypto-inflection.service

[Timer]
OnCalendar=daily
OnCalendar=09:00
Persistent=true

[Install]
WantedBy=timers.target
"""

# Validation runner service (runs daily at 10 AM)
VALIDATION_SERVICE = f"""[Unit]
Description=Crypto Inflection Tracker - Validation Runner
After=network.target crypto-inflection.service

[Service]
Type=oneshot
User={os.getenv('USER', 'phyrexian')}
WorkingDirectory={PROJECT_ROOT}
ExecStart={PYTHON_BIN} {SCRIPT_PATH} --validate 7
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""

VALIDATION_TIMER = """[Unit]
Description=Crypto Inflection Tracker - Validation Timer
Requires=crypto-inflection-validation.service

[Timer]
OnCalendar=daily
OnCalendar=10:00
Persistent=true

[Install]
WantedBy=timers.target
"""

# Crontab entries
CRONTAB_ENTRIES = f"""
# Crypto Inflection Tracker - Daily runs
0 9 * * * cd {PROJECT_ROOT} && {PYTHON_BIN} {SCRIPT_PATH} --coins 100 >> {PROJECT_ROOT}/logs/inflection_daily.log 2>&1
0 10 * * * cd {PROJECT_ROOT} && {PYTHON_BIN} {SCRIPT_PATH} --validate 7 >> {PROJECT_ROOT}/logs/inflection_validation.log 2>&1
"""

# Bash script for easy setup
SETUP_SCRIPT = f"""#!/bin/bash
# Crypto Inflection Tracker - Automation Setup

set -e

echo "🔧 Setting up crypto inflection tracker automation..."
echo

# Create log directory
LOG_DIR="{PROJECT_ROOT}/logs"
mkdir -p "$LOG_DIR"
echo "✓ Created log directory: $LOG_DIR"

# Choose automation method
echo
echo "Choose automation method:"
echo "  1) Systemd (recommended for servers)"
echo "  2) Cron (traditional, works everywhere)"
echo "  3) Both"
echo

read -p "Enter choice [1-3]: " choice

case $choice in
  1|3)
    echo
    echo "Installing systemd services..."
    
    # Write service files
    sudo tee /etc/systemd/system/crypto-inflection.service > /dev/null <<'EOF'
{SYSTEMD_SERVICE}
EOF
    
    sudo tee /etc/systemd/system/crypto-inflection.timer > /dev/null <<'EOF'
{SYSTEMD_TIMER}
EOF
    
    sudo tee /etc/systemd/system/crypto-inflection-validation.service > /dev/null <<'EOF'
{VALIDATION_SERVICE}
EOF
    
    sudo tee /etc/systemd/system/crypto-inflection-validation.timer > /dev/null <<'EOF'
{VALIDATION_TIMER}
EOF
    
    # Reload and enable
    sudo systemctl daemon-reload
    sudo systemctl enable crypto-inflection.timer
    sudo systemctl enable crypto-inflection-validation.timer
    sudo systemctl start crypto-inflection.timer
    sudo systemctl start crypto-inflection-validation.timer
    
    echo "✓ Systemd services installed and enabled"
    echo
    echo "Check status:"
    echo "  sudo systemctl status crypto-inflection.timer"
    echo "  sudo systemctl list-timers"
    echo
    echo "Manual run:"
    echo "  sudo systemctl start crypto-inflection.service"
    ;;
esac

case $choice in
  2|3)
    echo
    echo "Installing cron jobs..."
    
    # Backup existing crontab
    crontab -l > /tmp/crontab.backup 2>/dev/null || true
    
    # Add entries if not already present
    (crontab -l 2>/dev/null || true; echo "$CRONTAB_ENTRIES") | crontab -
    
    echo "✓ Cron jobs installed"
    echo
    echo "View crontab:"
    echo "  crontab -l"
    echo
    echo "View logs:"
    echo "  tail -f {PROJECT_ROOT}/logs/inflection_daily.log"
    ;;
esac

echo
echo "✅ Setup complete!"
echo
echo "The tracker will now run daily at:"
echo "  09:00 - Data collection"
echo "  10:00 - Validation (forward returns)"
"""


def create_setup_script():
    """Create automation setup script"""
    script_path = Path(__file__).parent / "setup_automation.sh"
    
    with open(script_path, 'w') as f:
        f.write(SETUP_SCRIPT)
    
    # Make executable
    os.chmod(script_path, 0o755)
    
    print(f"✓ Created setup script: {script_path}")
    print()
    print("To install automation:")
    print(f"  bash {script_path}")
    print()
    print("Or manually:")
    print()
    print("1. Systemd (recommended):")
    print(f"   Copy service files to /etc/systemd/system/")
    print(f"   sudo systemctl enable crypto-inflection.timer")
    print()
    print("2. Cron (traditional):")
    print(f"   crontab -e")
    print(f"   Add: 0 9 * * * cd {PROJECT_ROOT} && {PYTHON_BIN} {SCRIPT_PATH} --coins 100")


def create_systemd_files():
    """Create systemd service and timer files"""
    # Create in script directory (user must copy to /etc/systemd/system/)
    base_dir = Path(__file__).parent / "systemd"
    base_dir.mkdir(exist_ok=True)
    
    files = {
        'crypto-inflection.service': SYSTEMD_SERVICE,
        'crypto-inflection.timer': SYSTEMD_TIMER,
        'crypto-inflection-validation.service': VALIDATION_SERVICE,
        'crypto-inflection-validation.timer': VALIDATION_TIMER,
    }
    
    for filename, content in files.items():
        filepath = base_dir / filename
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"✓ Created: {filepath}")
    
    print()
    print("To install:")
    print(f"  sudo cp {base_dir}/*.service /etc/systemd/system/")
    print(f"  sudo cp {base_dir}/*.timer /etc/systemd/system/")
    print(f"  sudo systemctl daemon-reload")
    print(f"  sudo systemctl enable crypto-inflection.timer")
    print(f"  sudo systemctl start crypto-inflection.timer")


if __name__ == "__main__":
    print("Crypto Inflection Tracker - Automation Setup")
    print()
    
    if '--systemd' in sys.argv:
        create_systemd_files()
    elif '--script' in sys.argv:
        create_setup_script()
    else:
        print("Usage:")
        print("  --systemd   Create systemd service files")
        print("  --script    Create interactive setup script")
        print()
        
        # Create both
        create_systemd_files()
        print()
        create_setup_script()

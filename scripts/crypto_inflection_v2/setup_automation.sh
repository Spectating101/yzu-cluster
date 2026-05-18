#!/bin/bash
# Crypto Inflection Tracker - Automation Setup

set -e

echo "🔧 Setting up crypto inflection tracker automation..."
echo

# Create log directory
LOG_DIR="/home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance/logs"
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
[Unit]
Description=Crypto Inflection Tracker - Daily Runner
After=network.target

[Service]
Type=oneshot
User=phyrexian
WorkingDirectory=/home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance
ExecStart=/usr/bin/python3 /home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance/scripts/crypto_inflection_v2/daily_runner.py --coins 100
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

EOF
    
    sudo tee /etc/systemd/system/crypto-inflection.timer > /dev/null <<'EOF'
[Unit]
Description=Crypto Inflection Tracker - Daily Timer
Requires=crypto-inflection.service

[Timer]
OnCalendar=daily
OnCalendar=09:00
Persistent=true

[Install]
WantedBy=timers.target

EOF
    
    sudo tee /etc/systemd/system/crypto-inflection-validation.service > /dev/null <<'EOF'
[Unit]
Description=Crypto Inflection Tracker - Validation Runner
After=network.target crypto-inflection.service

[Service]
Type=oneshot
User=phyrexian
WorkingDirectory=/home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance
ExecStart=/usr/bin/python3 /home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance/scripts/crypto_inflection_v2/daily_runner.py --validate 7
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

EOF
    
    sudo tee /etc/systemd/system/crypto-inflection-validation.timer > /dev/null <<'EOF'
[Unit]
Description=Crypto Inflection Tracker - Validation Timer
Requires=crypto-inflection-validation.service

[Timer]
OnCalendar=daily
OnCalendar=10:00
Persistent=true

[Install]
WantedBy=timers.target

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
    echo "  tail -f /home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance/logs/inflection_daily.log"
    ;;
esac

echo
echo "✅ Setup complete!"
echo
echo "The tracker will now run daily at:"
echo "  09:00 - Data collection"
echo "  10:00 - Validation (forward returns)"

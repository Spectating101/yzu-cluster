# -*- coding: utf-8 -*-
import sys
import os
import asyncio
import json

# Dynamic Pathing to connect the Fleet
# Sharpe/data_tools (Level 3) -> Sharpe (Level 2) -> Molina (Level 1) -> Root -> OverSight-OSINT
# Path: ../../../OverSight-OSINT/backend
fleet_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../OverSight-OSINT/backend'))
core_path = os.path.join(fleet_root, 'core')

sys.path.append(fleet_root)
sys.path.append(core_path)

try:
    from osint_engine import OSINTEngine
except ImportError:
    print(f'CRITICAL: Could not load Intelligence Engine. Checked: {fleet_root}')
    sys.exit(1)

async def scan_assets():
    print('--- 📉 Sharpe-Renaissance: Asset Compliance Shield 📉 ---')
    
    assets = ['NVIDIA', 'Gazprom', 'Tether']
    engine = OSINTEngine()
    
    for asset in assets:
        print(f'\n[Vetting Asset]: {asset}...')
        report = await engine.investigate(asset)
        sanctions = report['risk_profile']['sanctions']
        
        if sanctions['is_flagged']:
            print(f'  ❌ TRADING HALTED: {asset} is flagged on a Watchlist.')
            print(f'  -> Source: {sanctions["source"]}')
            ev = sanctions["evidence"][0]
            name_match = ev.get("match_name", "Unknown") if isinstance(ev, dict) else str(ev)
            print(f'  -> Match: {name_match}')
        else:
            print(f'  ✅ TRADING APPROVED: {asset} is clean.')

if __name__ == '__main__':
    asyncio.run(scan_assets())

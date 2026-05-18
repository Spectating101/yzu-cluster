"""Web dashboard for inflection tracker using Flask and Plotly"""

try:
    from flask import Flask, render_template_string, jsonify
    import plotly.graph_objs as go
    import plotly
    import json
except ImportError:
    print("⚠️  Flask and Plotly not installed")
    print("   Install with: pip install flask plotly pandas")
    exit(1)

import pandas as pd
from pathlib import Path
from datetime import datetime
import sys

sys.path.append(str(Path(__file__).parent))
from storage import SQLiteStorage
from processors.regime_detector import RegimeDetector
from config import get_config

app = Flask(__name__)
storage = SQLiteStorage()
config = get_config()


# HTML Template
DASHBOARD_HTML = '''
<!DOCTYPE html>
<html>
<head>
    <title>Crypto Inflection Tracker</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #0f0f23;
            color: #cccccc;
        }
        .header {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 10px;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0;
            color: white;
            font-size: 2.5em;
        }
        .header p {
            margin: 10px 0 0 0;
            color: rgba(255,255,255,0.9);
        }
        .regime-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
            margin: 10px 5px;
        }
        .regime-BULL { background: #10b981; color: white; }
        .regime-BEAR { background: #ef4444; color: white; }
        .regime-RANGE { background: #f59e0b; color: white; }
        .regime-VOLATILE { background: #8b5cf6; color: white; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #1a1a2e;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #2d2d44;
        }
        .stat-card h3 {
            margin: 0 0 10px 0;
            color: #667eea;
            font-size: 0.9em;
            text-transform: uppercase;
        }
        .stat-card .value {
            font-size: 2em;
            font-weight: bold;
            color: white;
        }
        .chart-container {
            background: #1a1a2e;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 30px;
            border: 1px solid #2d2d44;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: #1a1a2e;
            border-radius: 10px;
            overflow: hidden;
        }
        th {
            background: #667eea;
            color: white;
            padding: 15px;
            text-align: left;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #2d2d44;
        }
        tr:hover {
            background: #2d2d44;
        }
        .score-high { color: #10b981; font-weight: bold; }
        .score-med { color: #f59e0b; font-weight: bold; }
        .score-low { color: #6b7280; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔥 Crypto Inflection Tracker</h1>
        <p>Multi-dimensional momentum detection system</p>
        <div>
            <span class="regime-badge regime-{{ regime.regime }}">{{ regime.regime }}</span>
            <span style="color: white;">Confidence: {{ "%.0f"|format(regime.confidence * 100) }}%</span>
        </div>
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <h3>Total Coins Tracked</h3>
            <div class="value">{{ stats.total }}</div>
        </div>
        <div class="stat-card">
            <h3>🔥🔥 Very Strong (5+)</h3>
            <div class="value">{{ stats.score_5plus }}</div>
        </div>
        <div class="stat-card">
            <h3>🔥 Strong (4)</h3>
            <div class="value">{{ stats.score_4 }}</div>
        </div>
        <div class="stat-card">
            <h3>📈 Bullish (3)</h3>
            <div class="value">{{ stats.score_3 }}</div>
        </div>
    </div>
    
    <div class="chart-container">
        <h2>Score Distribution</h2>
        <div id="scoreChart"></div>
    </div>
    
    <div class="chart-container">
        <h2>Top Inflections</h2>
        <table>
            <thead>
                <tr>
                    <th>Verdict</th>
                    <th>Coin</th>
                    <th>Price</th>
                    <th>Score</th>
                    <th>Signals</th>
                </tr>
            </thead>
            <tbody>
                {% for coin in top_coins %}
                <tr>
                    <td>{{ coin.verdict }}</td>
                    <td><strong>{{ coin.name }}</strong></td>
                    <td>${{ "%.4f"|format(coin.price_usd) if coin.price_usd < 1 else "%.2f"|format(coin.price_usd) }}</td>
                    <td class="{% if coin.score >= 5 %}score-high{% elif coin.score >= 3 %}score-med{% else %}score-low{% endif %}">
                        {{ coin.score }}/8
                    </td>
                    <td>{{ coin.signals_fired }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
    
    <script>
        // Score distribution chart
        var scoreData = {{ score_dist_json | safe }};
        var layout = {
            paper_bgcolor: '#1a1a2e',
            plot_bgcolor: '#1a1a2e',
            font: { color: '#cccccc' },
            xaxis: { title: 'Score' },
            yaxis: { title: 'Count' },
            margin: { t: 30, b: 50, l: 50, r: 30 }
        };
        Plotly.newPlot('scoreChart', scoreData, layout);
    </script>
</body>
</html>
'''


@app.route('/')
def dashboard():
    """Main dashboard view"""
    # Get latest snapshot
    latest_df = storage.read_snapshot(datetime.now())
    
    if latest_df.empty:
        return "No data available. Run daily_runner.py first."
    
    # Calculate stats
    stats = {
        'total': len(latest_df),
        'score_5plus': len(latest_df[latest_df['score'] >= 5]),
        'score_4': len(latest_df[latest_df['score'] == 4]),
        'score_3': len(latest_df[latest_df['score'] == 3]),
    }
    
    # Get current regime
    detector = RegimeDetector()
    regime = detector.detect_regime()
    
    # Top coins
    top_coins = latest_df.nlargest(20, 'score').to_dict('records')
    
    # Add fired signals to each coin
    signal_names = ['price_breakout', 'volume_surge', 'accelerating', 
                   'mcap_surge', 'beats_btc', 'vol_spike', 'uptrend', 'accumulation']
    
    for coin in top_coins:
        fired = [s.replace('_', ' ').title() for s in signal_names if coin.get(s, 0) > 0.5]
        coin['signals_fired'] = ', '.join(fired[:3]) if fired else 'None'
    
    # Score distribution
    score_counts = latest_df['score'].value_counts().sort_index()
    
    score_dist = [
        go.Bar(
            x=score_counts.index.tolist(),
            y=score_counts.values.tolist(),
            marker=dict(color='#667eea')
        )
    ]
    
    score_dist_json = json.dumps(score_dist, cls=plotly.utils.PlotlyJSONEncoder)
    
    return render_template_string(
        DASHBOARD_HTML,
        stats=stats,
        regime=regime,
        top_coins=top_coins,
        score_dist_json=score_dist_json
    )


@app.route('/api/latest')
def api_latest():
    """API endpoint for latest data"""
    latest_df = storage.read_snapshot(datetime.now())
    
    if latest_df.empty:
        return jsonify({'error': 'No data available'})
    
    return jsonify(latest_df.to_dict('records'))


@app.route('/api/coin/<coin_id>')
def api_coin(coin_id):
    """API endpoint for specific coin history"""
    history = storage.get_history(coin_id, days=30)
    
    if history.empty:
        return jsonify({'error': 'Coin not found'})
    
    return jsonify(history.to_dict('records'))


def run_dashboard(port: int = None, debug: bool = False):
    """Run the dashboard server"""
    if port is None:
        port = config.dashboard_port
    
    print(f"🌐 Starting dashboard on http://localhost:{port}")
    print(f"   Press Ctrl+C to stop")
    print()
    
    app.run(host='0.0.0.0', port=port, debug=debug)


if __name__ == "__main__":
    import sys
    
    port = config.dashboard_port
    debug = '--debug' in sys.argv
    
    # Check if data exists
    latest_df = storage.read_snapshot(datetime.now())
    
    if latest_df.empty:
        print("⚠️  No data available")
        print("   Run daily_runner.py first to generate data")
        print()
    
    run_dashboard(port=port, debug=debug)

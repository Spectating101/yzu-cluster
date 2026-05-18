"""Machine learning model for signal prediction"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Dict, Tuple
import sys

sys.path.append(str(Path(__file__).parent))
from storage import SQLiteStorage

try:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.metrics import classification_report, mean_squared_error, r2_score
    import joblib
except ImportError:
    print("⚠️  scikit-learn not installed")
    print("   Install with: pip install scikit-learn joblib")
    exit(1)


class InflectionMLModel:
    """
    Machine learning model for inflection prediction.
    
    Two models:
    1. Classification: Will this coin outperform? (binary)
    2. Regression: What return to expect? (continuous)
    """
    
    def __init__(self):
        self.storage = SQLiteStorage()
        self.classifier = None
        self.regressor = None
        self.feature_importance = None
    
    def prepare_training_data(self, days_forward: int = 7, min_samples: int = 100) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Prepare training data from historical snapshots + forward returns.
        
        Returns:
            (X, y) where X is features and y is target (returns)
        """
        print(f"📊 Preparing training data...")
        
        # Get validation data (snapshots with forward returns)
        validation_df = self.storage.get_validation_data(days_forward=days_forward, min_score=0)
        
        if len(validation_df) < min_samples:
            raise ValueError(f"Not enough samples: {len(validation_df)} < {min_samples}")
        
        print(f"  Total samples: {len(validation_df)}")
        
        # Features: signals only
        feature_cols = [
            'price_breakout', 'volume_surge', 'accelerating', 'mcap_surge',
            'beats_btc', 'vol_spike', 'uptrend', 'accumulation'
        ]
        
        # Get snapshot data with signals
        # For now, we only have scores in validation_df
        # Would need to re-query snapshots for full signal data
        
        # This is a limitation - need to store signal details in forward_returns table
        # For MVP, use score as proxy
        
        X = validation_df[['score']].copy()
        y = validation_df['return_pct'].copy()
        
        print(f"  Features: {list(X.columns)}")
        print(f"  Target: return_pct")
        print()
        
        return X, y
    
    def train_regressor(self, X: pd.DataFrame, y: pd.Series) -> Dict:
        """
        Train regression model to predict returns.
        
        Returns:
            Dict with training metrics
        """
        print("🧠 Training regression model...")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        print(f"  Train set: {len(X_train)} samples")
        print(f"  Test set: {len(X_test)} samples")
        
        # Train model
        self.regressor = GradientBoostingRegressor(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=3,
            random_state=42
        )
        
        self.regressor.fit(X_train, y_train)
        
        # Evaluate
        y_pred = self.regressor.predict(X_test)
        
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        r2 = r2_score(y_test, y_pred)
        
        # Cross-validation
        cv_scores = cross_val_score(self.regressor, X_train, y_train, cv=5, scoring='r2')
        
        metrics = {
            'mse': mse,
            'rmse': rmse,
            'r2': r2,
            'cv_r2_mean': cv_scores.mean(),
            'cv_r2_std': cv_scores.std(),
        }
        
        print()
        print(f"  RMSE: {rmse:.2f}%")
        print(f"  R²: {r2:.3f}")
        print(f"  CV R² (mean ± std): {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
        print()
        
        # Feature importance
        if hasattr(self.regressor, 'feature_importances_'):
            self.feature_importance = pd.DataFrame({
                'feature': X.columns,
                'importance': self.regressor.feature_importances_
            }).sort_values('importance', ascending=False)
            
            print("  Feature importance:")
            for _, row in self.feature_importance.iterrows():
                print(f"    {row['feature']:20s}: {row['importance']:.3f}")
        
        return metrics
    
    def train_classifier(self, X: pd.DataFrame, y: pd.Series, threshold: float = 10.0) -> Dict:
        """
        Train classification model to predict outperformance.
        
        Args:
            threshold: Return threshold for positive class (default: 10%)
        
        Returns:
            Dict with training metrics
        """
        print(f"🧠 Training classification model (threshold: {threshold}%)...")
        
        # Create binary labels
        y_binary = (y >= threshold).astype(int)
        
        print(f"  Positive class: {y_binary.sum()} ({y_binary.mean():.1%})")
        print(f"  Negative class: {(~y_binary.astype(bool)).sum()}")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_binary, test_size=0.2, random_state=42, stratify=y_binary
        )
        
        # Train model
        self.classifier = RandomForestClassifier(
            n_estimators=100,
            max_depth=5,
            random_state=42,
            class_weight='balanced'
        )
        
        self.classifier.fit(X_train, y_train)
        
        # Evaluate
        y_pred = self.classifier.predict(X_test)
        
        print()
        print("  Classification Report:")
        print(classification_report(y_test, y_pred, target_names=['No outperformance', 'Outperformance']))
        
        # Accuracy
        accuracy = (y_pred == y_test).mean()
        
        metrics = {
            'accuracy': accuracy,
            'threshold': threshold,
        }
        
        return metrics
    
    def predict(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Make predictions on new data.
        
        Returns:
            (predicted_returns, predicted_proba) if both models trained
        """
        if self.regressor is None:
            raise ValueError("Regressor not trained. Call train_regressor() first.")
        
        predicted_returns = self.regressor.predict(X)
        
        predicted_proba = None
        if self.classifier is not None:
            predicted_proba = self.classifier.predict_proba(X)[:, 1]  # Prob of positive class
        
        return predicted_returns, predicted_proba
    
    def save_models(self, path: Path = None):
        """Save trained models"""
        if path is None:
            path = Path(__file__).parent.parent.parent / "data_lake/crypto_inflection/models"
            path.mkdir(parents=True, exist_ok=True)
        
        if self.regressor is not None:
            joblib.dump(self.regressor, path / "regressor.pkl")
            print(f"✓ Saved regressor: {path / 'regressor.pkl'}")
        
        if self.classifier is not None:
            joblib.dump(self.classifier, path / "classifier.pkl")
            print(f"✓ Saved classifier: {path / 'classifier.pkl'}")
    
    def load_models(self, path: Path = None):
        """Load trained models"""
        if path is None:
            path = Path(__file__).parent.parent.parent / "data_lake/crypto_inflection/models"
        
        regressor_path = path / "regressor.pkl"
        if regressor_path.exists():
            self.regressor = joblib.load(regressor_path)
            print(f"✓ Loaded regressor")
        
        classifier_path = path / "classifier.pkl"
        if classifier_path.exists():
            self.classifier = joblib.load(classifier_path)
            print(f"✓ Loaded classifier")


if __name__ == "__main__":
    print("Inflection ML Model - Training")
    print()
    
    model = InflectionMLModel()
    
    try:
        # Prepare data
        X, y = model.prepare_training_data(days_forward=7, min_samples=10)
        
        # Train regressor
        reg_metrics = model.train_regressor(X, y)
        
        # Train classifier
        clf_metrics = model.train_classifier(X, y, threshold=10.0)
        
        # Save models
        model.save_models()
        
        print()
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print()
        print(f"Regression:")
        print(f"  RMSE: {reg_metrics['rmse']:.2f}%")
        print(f"  R²: {reg_metrics['r2']:.3f}")
        print()
        print(f"Classification:")
        print(f"  Accuracy: {clf_metrics['accuracy']:.1%}")
        print()
        print("✓ Models trained and saved")
        print()
        print("⚠️  Note: This is an MVP implementation")
        print("   For production:")
        print("   - Store full signal data in forward_returns table")
        print("   - Use all 8+ signals as features (not just score)")
        print("   - Add time-based features (day of week, month, etc)")
        print("   - Ensemble multiple models")
        print("   - Regular retraining as new data arrives")
        
    except ValueError as e:
        print(f"❌ Error: {e}")
        print()
        print("Need more historical data to train ML models.")
        print("Run daily tracker for at least 2 weeks to accumulate training data.")

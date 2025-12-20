"""Data source plugins for FinSight"""

from src.data_sources.base import (
    DataSource,
    DataSourcePlugin,
    DataSourceType,
    DataSourceCapability,
    FinancialData,
    DataSourceRegistry,
    get_registry,
    register_source
)

__all__ = [
    "DataSource",
    "DataSourcePlugin",
    "DataSourceType",
    "DataSourceCapability",
    "FinancialData",
    "DataSourceRegistry",
    "get_registry",
    "register_source"
]

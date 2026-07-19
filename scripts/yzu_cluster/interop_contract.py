"""Dependency-free execution truth for the YZU cluster control plane."""
from ._interop_common import BaseStore, Claim, stage, now_utc, normalize_capabilities
from ._interop_runtime import RuntimeMixin
from ._interop_registry import RegistryMixin
from .interop_connectors import ConnectorMixin
from .interop_resources import ResourceMixin


class InteropStore(ResourceMixin, ConnectorMixin, RuntimeMixin, RegistryMixin, BaseStore):
    """Durable worker, execution, connector, resource, and asset-registration store."""

    def __init__(self, database=":memory:") -> None:
        super().__init__(database)
        self._init_connectors()
        self._init_resources()


__all__ = ["Claim", "InteropStore", "stage", "now_utc", "normalize_capabilities"]

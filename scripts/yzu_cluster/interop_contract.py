"""Dependency-free execution truth for the YZU cluster control plane.

This reference module can be imported or transplanted into the private
YzuOrchestrator. It emits the additive contracts consumed by Research Drive.
"""
from ._interop_common import BaseStore, Claim, stage, now_utc, normalize_capabilities
from ._interop_runtime import RuntimeMixin
from ._interop_registry import RegistryMixin
from .interop_connectors import ConnectorMixin


class InteropStore(ConnectorMixin, RuntimeMixin, RegistryMixin, BaseStore):
    """Durable worker, execution, connector, and asset-registration store."""

    def __init__(self, database=":memory:") -> None:
        super().__init__(database)
        self._init_connectors()


__all__ = ["Claim", "InteropStore", "stage", "now_utc", "normalize_capabilities"]

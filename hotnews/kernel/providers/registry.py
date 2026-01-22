from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .base import Provider


@dataclass
class ProviderRegistry:
    _providers: Dict[str, Provider]

    def __init__(self):
        self._providers = {}

    def register(self, provider: Provider) -> None:
        pid = getattr(provider, "provider_id", None)
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError("provider.provider_id must be a non-empty string")
        if pid in self._providers:
            raise ValueError(f"provider_id already registered: {pid}")
        self._providers[pid] = provider

    def get(self, provider_id: str) -> Provider:
        if provider_id not in self._providers:
            raise KeyError(f"unknown provider_id: {provider_id}")
        return self._providers[provider_id]

    def maybe_get(self, provider_id: str) -> Optional[Provider]:
        return self._providers.get(provider_id)

    def all(self) -> Dict[str, Provider]:
        return dict(self._providers)


_default_registry: Optional[ProviderRegistry] = None


def get_default_registry() -> ProviderRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = ProviderRegistry()
    return _default_registry

from enum import StrEnum

from pydantic import BaseModel


class HealthState(StrEnum):
    STARTING = "STARTING"
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    FATAL = "FATAL"
    DISABLED = "DISABLED"


class ComponentHealth(BaseModel):
    state: HealthState
    reason_code: str | None = None


class HealthModel(BaseModel):
    core: ComponentHealth = ComponentHealth(state=HealthState.STARTING)
    storage: ComponentHealth = ComponentHealth(state=HealthState.STARTING)
    content: ComponentHealth = ComponentHealth(state=HealthState.STARTING)
    voice: ComponentHealth = ComponentHealth(state=HealthState.DISABLED)
    camera: ComponentHealth = ComponentHealth(state=HealthState.DISABLED)

    @property
    def ready(self) -> bool:
        return self.core.state in {HealthState.HEALTHY, HealthState.DEGRADED}

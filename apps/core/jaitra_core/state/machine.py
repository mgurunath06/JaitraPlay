from __future__ import annotations

from enum import StrEnum


class AppState(StrEnum):
    BOOTSTRAP = "BOOTSTRAP"
    IDLE = "IDLE"
    WELCOME = "WELCOME"
    HUB = "HUB"
    ACTIVITY_LOADING = "ACTIVITY_LOADING"
    ROUND_ACTIVE = "ROUND_ACTIVE"
    ROUND_FEEDBACK = "ROUND_FEEDBACK"
    ACTIVITY_SUMMARY = "ACTIVITY_SUMMARY"
    SESSION_END = "SESSION_END"
    RECOVERY = "RECOVERY"


class CommandType(StrEnum):
    BEGIN_INTERACTION = "BEGIN_INTERACTION"
    WELCOME_COMPLETE = "WELCOME_COMPLETE"


class TransitionError(RuntimeError):
    def __init__(self, code: str = "STATE_COMMAND_NOT_ALLOWED") -> None:
        super().__init__(code)
        self.code = code


class StateMachine:
    def __init__(self) -> None:
        self.state = AppState.BOOTSTRAP

    def mark_ready(self) -> AppState:
        if self.state not in {AppState.BOOTSTRAP, AppState.RECOVERY}:
            raise TransitionError()
        self.state = AppState.IDLE
        return self.state

    def mark_fatal(self) -> AppState:
        self.state = AppState.RECOVERY
        return self.state

    def dispatch(self, command: CommandType) -> AppState:
        transitions = {
            (AppState.IDLE, CommandType.BEGIN_INTERACTION): AppState.WELCOME,
            (AppState.WELCOME, CommandType.WELCOME_COMPLETE): AppState.HUB,
        }
        destination = transitions.get((self.state, command))
        if destination is None:
            raise TransitionError()
        self.state = destination
        return destination

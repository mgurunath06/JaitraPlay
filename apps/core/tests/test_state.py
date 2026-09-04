import pytest
from jaitra_core.state import AppState, CommandType, StateMachine, TransitionError


def test_release_01a1_happy_path() -> None:
    machine = StateMachine()
    assert machine.mark_ready() == AppState.IDLE
    assert machine.dispatch(CommandType.BEGIN_INTERACTION) == AppState.WELCOME
    assert machine.dispatch(CommandType.WELCOME_COMPLETE) == AppState.HUB


def test_renderer_cannot_choose_destination() -> None:
    machine = StateMachine()
    machine.mark_ready()
    with pytest.raises(TransitionError):
        machine.dispatch(CommandType.WELCOME_COMPLETE)
    assert machine.state == AppState.IDLE

import pytest
from fastapi.testclient import TestClient

from app.main import app

@pytest.fixture
def client():
    """Isolated FastAPI TestClient fixture for hermetic unit testing."""
    return TestClient(app)

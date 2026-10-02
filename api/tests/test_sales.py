"""Functional API checks on isolated SQLite; PostgreSQL plans are measured in the lab."""

import os
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "isolated-test-secret-for-sales-tests"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import SalesRecord


class SalesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)

        def database():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)
        self.headers = self.register("planner1")
        self.other_headers = self.register("planner2")

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()

    def register(self, username):
        response = self.client.post("/register", json={"username": username, "password": "test-password-123"})
        self.assertEqual(response.status_code, 201, response.text)
        return {"Authorization": "Bearer " + response.json()["access_token"]}

    def seed(self, headers=None):
        rows = [
            {"sale_date": "2026-09-10", "product_code": "TK-A-001", "region": "Bangkok", "sales_quantity": quantity}
            for quantity in (10, 20, 30)
        ] + [{"sale_date": "2026-10-01", "product_code": "TK-A-001", "region": "Bangkok", "sales_quantity": 99}]
        response = self.client.post("/sales/batch", headers=headers or self.headers, json={"items": rows})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["inserted"], 4)

    def test_user_isolation_and_keyset_ties(self):
        self.seed()
        self.seed(self.other_headers)
        params = {"limit": 2, "product_code": "TK-A-001", "region": "Bangkok"}
        first = self.client.get("/sales", headers=self.headers, params=params).json()
        second = self.client.get("/sales", headers=self.headers, params=params | {"cursor": first["next_cursor"]}).json()
        items = first["items"] + second["items"]
        self.assertEqual(len({row["id"] for row in items}), 4)
        self.assertEqual([row["sales_quantity"] for row in items], [99, 30, 20, 10])
        self.assertIsNone(second["next_cursor"])

    def test_exclusive_end_date_and_daily_sum(self):
        self.seed()
        self.seed(self.other_headers)
        params = {"start_date": "2026-09-01", "end_date": "2026-10-01", "product_code": "TK-A-001", "region": "Bangkok"}
        response = self.client.get("/sales/daily", headers=self.headers, params=params)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), [{"sale_date": "2026-09-10", "sales_quantity": 60}])
        self.assertEqual(len(self.client.get("/sales", headers=self.headers, params=params).json()["items"]), 3)
        self.assertEqual(self.client.get("/sales/daily", headers=self.headers, params=params | {"region": "Other"}).json(), [])

    def test_auth_and_input_limits(self):
        self.assertEqual(self.client.get("/sales").status_code, 401)
        self.assertEqual(self.client.post("/sales/batch", json={"items": []}).status_code, 401)
        for params in ({"limit": 101}, {"cursor": "bad"}, {"cursor": "2026-09-10:0"}, {"cursor": "2026-09-10:99999999999999999999"},
                       {"start_date": "2026-10-01", "end_date": "2026-09-01"}):
            self.assertEqual(self.client.get("/sales", headers=self.headers, params=params).status_code, 422)
        self.assertEqual(self.client.get("/sales/daily", headers=self.headers,
                                        params={"start_date": "2024-01-01", "end_date": "2026-01-01"}).status_code, 422)
        valid = {"sale_date": "2026-09-10", "product_code": "TK-A-001", "region": "Bangkok", "sales_quantity": 10}
        for rows in ([], [valid | {"sales_quantity": -1}], [valid | {"sales_quantity": 2147483648}],
                     [valid | {"region": "  "}], [valid | {"inventory": -1}], [valid] * 1001):
            self.assertEqual(self.client.post("/sales/batch", headers=self.headers, json={"items": rows}).status_code, 422)

    def test_deleting_owner_cascades_sales(self):
        self.seed()
        user = self.client.get("/me", headers=self.headers).json()
        response = self.client.delete(f"/users/{user['id']}", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        with Session(self.engine) as session:
            self.assertEqual(session.scalars(select(SalesRecord)).all(), [])


if __name__ == "__main__":
    unittest.main()

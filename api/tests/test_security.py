import os
import unittest
os.environ['DATABASE_URL']='sqlite://'
os.environ['JWT_SECRET_KEY']='isolated-test-secret-for-sales-tests'
import test_workflow


class SecurityTests(unittest.TestCase):
    setUp = test_workflow.WorkflowTests.setUp
    tearDown = test_workflow.WorkflowTests.tearDown
    register = test_workflow.WorkflowTests.register
    get = test_workflow.WorkflowTests.get
    post = test_workflow.WorkflowTests.post
    def test_password_change_invalidates_all_sessions(self):
        second=self.client.post('/login',json={'username_or_email':'owner1','password':'test-password-123'})
        self.assertEqual(second.status_code,200)
        self.assertEqual(self.client.post('/change-password',headers=self.headers,json={'current_password':'test-password-123','new_password':'new-password-456'}).status_code,200)
        self.assertEqual(self.client.get('/me',headers=self.headers).status_code,401)
        self.assertEqual(self.client.get('/me',headers={'Authorization':'Bearer '+second.json()['access_token']}).status_code,401)
        self.assertEqual(self.client.post('/login',json={'username_or_email':'owner1','password':'new-password-456'}).status_code,200)

    def test_owner_delete_preserves_workspace(self):
        user_id=self.client.get('/me',headers=self.headers).json()['id']
        self.assertEqual(self.client.delete(f'/users/{user_id}',headers=self.headers).status_code,409)
        self.assertEqual(self.get('').status_code,200)

    def test_request_size_and_auth_burst_guards(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.middleware import RequestGuard
        fixture=FastAPI()
        fixture.add_middleware(RequestGuard,max_bytes=64,auth_limit=2)
        @fixture.post('/login')
        def login():
            return {'ok':True}
        with TestClient(fixture) as client:
            self.assertEqual(client.post('/login').status_code,200)
            self.assertEqual(client.post('/login').status_code,200)
            self.assertEqual(client.post('/login').status_code,429)
            self.assertEqual(client.post('/upload',content='x'*65).status_code,413)

    def test_production_rejects_placeholder_credentials(self):
        from app.config import Settings
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            Settings(_env_file=None,deployment_mode='production',jwt_secret_key='replace-this-secret',database_url='postgresql+psycopg://demandly:demandly@db/demandly')
        settings=Settings(_env_file=None,deployment_mode='production',jwt_secret_key='a'*64,database_url='postgresql+psycopg://demandly:'+('b'*32)+'@db/demandly')
        self.assertEqual(settings.deployment_mode,'production')

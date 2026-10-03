"""Bound request size and authentication bursts without retaining credentials."""
import json
import time
from collections import deque
from threading import Lock


class RequestGuard:
    def __init__(self, app, max_bytes=29 * 1024 * 1024, auth_limit=120):
        self.app, self.max_bytes, self.auth_limit = app, max_bytes, auth_limit
        self.bursts, self.lock = {}, Lock()

    async def reject(self, send, status, message):
        body = json.dumps({'detail': message}).encode()
        await send({'type': 'http.response.start', 'status': status, 'headers': [(b'content-type', b'application/json')]})
        await send({'type': 'http.response.body', 'body': body})

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        if scope['path'] in ('/login', '/register'):
            key = (scope.get('client') or ('unknown', 0))[0]
            now = time.monotonic()
            with self.lock:
                if len(self.bursts) > 10000:
                    self.bursts = {k: q for k, q in self.bursts.items() if q and q[-1] > now-60}
                queue = self.bursts.setdefault(key, deque())
                while queue and queue[0] < now-60:
                    queue.popleft()
                blocked = len(queue) >= self.auth_limit
                if not blocked:
                    queue.append(now)
            if blocked:
                return await self.reject(send, 429, 'Too many authentication attempts. Wait one minute.')
        chunks, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > self.max_bytes:
                return await self.reject(send, 413, 'Request body exceeds 29 MB. Upload a file of at most 20 MB.')
            chunks.append(message)
            if not message.get('more_body', False):
                break
        async def buffered_receive():
            if chunks:
                return chunks.pop(0)
            return await receive()
        async def headers_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message.get('headers', [])) + [(b'x-content-type-options', b'nosniff'), (b'referrer-policy', b'no-referrer')]
            await send(message)
        return await self.app(scope, buffered_receive, headers_send)

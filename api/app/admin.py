"""Console-only administration using operator database access, no default admin account."""
import argparse
from sqlalchemy import select
from .database import SessionLocal
from .models import User

parser=argparse.ArgumentParser()
parser.add_argument('action',choices=['promote','disable','enable'])
parser.add_argument('username')
args=parser.parse_args()
with SessionLocal() as session:
    user=session.scalar(select(User).where(User.username==args.username.strip().lower()))
    if user is None:
        raise SystemExit('Register this account first.')
    if args.action=='promote':
        user.role='admin'
    else:
        user.is_active=args.action=='enable'
    session.commit()
    print(f'{user.username}: {args.action} completed.')

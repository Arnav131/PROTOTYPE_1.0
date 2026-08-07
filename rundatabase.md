
pip install -r requirements.txt


python backend/manage.py makemigrations        # (should say "No changes detected")
python backend/manage.py migrate               # creates auth tables + seeds Postgres schema
python backend/manage.py seed_master_data
python backend/manage.py seed_routes
python backend/manage.py seed_sensors
python backend/manage.py seed_demo_data
python backend/manage.py seed_users
python backend/manage.py runserver
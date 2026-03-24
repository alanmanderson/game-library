import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate


app = Flask(__name__)

app.config.from_object('config.DevelopmentConfig')
db = SQLAlchemy(app)
migrate = Migrate(app, db)

@app.route('/')
def hello_world():
    return 'Hello, World!'

if __name__ == '__main__':
    app.run(debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true')

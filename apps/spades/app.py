from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello, World!'

if __name__ == '__main__':
    app.run(debug=True)
from flask_sqlalchemy import SQLAlchemy

app.config.from_object('config')
db = SQLAlchemy(app)

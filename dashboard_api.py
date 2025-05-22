from flask import Flask, jsonify, request
from azure.cosmos import CosmosClient
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from flask_cors import CORS
import hashlib
import secrets
import jwt
from functools import wraps

load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
#TESTING
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
DATABASE_NAME = "dendashboard"
CONTAINER_NAME = "dendbcontainer"

# JWT configuration
JWT_SECRET = os.getenv('JWT_SECRET', secrets.token_hex(32))  # Generate a random secret if not set
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION = 365 * 24 * 60 * 60  # 1 year in seconds (365 days * 24 hours * 60 minutes * 60 seconds)

# Admin credentials (in a real app, these would be stored in a secure database)
ADMIN_PASSWORD_HASH = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()

client = CosmosClient(COSMOS_ENDPOINT, COSMOS_KEY)
database = client.get_database_client(DATABASE_NAME)
container = database.get_container_client(CONTAINER_NAME)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        try:
            token = token.split(' ')[1]  # Remove 'Bearer ' prefix
            data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            # Check if token is expired
            if datetime.utcnow().timestamp() > data['exp']:
                return jsonify({'message': 'Token has expired'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Token is invalid'}), 401
        except Exception as e:
            return jsonify({'message': f'Token validation error: {str(e)}'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    password = data.get('password')
    
    if not password:
        return jsonify({'message': 'Password is required'}), 400
    
    # Hash the provided password
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    if password_hash == ADMIN_PASSWORD_HASH:
        # Generate JWT token with current timestamp
        token = jwt.encode({
            'exp': datetime.utcnow() + timedelta(seconds=JWT_EXPIRATION),
            'iat': datetime.utcnow()  # Issued at time
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        return jsonify({
            'token': token,
            'expires_in': JWT_EXPIRATION
        })
    
    return jsonify({'message': 'Invalid password'}), 401

@app.route('/api/data', methods=['GET'])
@token_required
def get_data():
    # Get hours parameter from query string, default to 24 hours
    hours = int(request.args.get('hours', 24))
    
    # Calculate the start time based on the hours parameter
    start_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    # Query Cosmos DB for data within the specified timeframe
    query = f"SELECT * FROM c WHERE c.timestamp >= '{start_time}' ORDER BY c.timestamp ASC"
    items = list(container.query_items(query=query, enable_cross_partition_query=True))
    return jsonify(items)

if __name__ == '__main__':
    app.run(debug=True, port=5000) 
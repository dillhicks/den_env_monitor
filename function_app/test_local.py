import requests
import json

# Azure Function URL with function key
FUNCTION_URL = os.getenv("AZURE_FUNCTION_URL")

# Simulate sensor data
test_data = {
    "temperature": 25.5,
    "humidity": 45.2,
    "voc_index": 123,
    "raw_voc": 45678
}

# Send POST request to function
response = requests.post(
    FUNCTION_URL,
    json=test_data,
    headers={"Content-Type": "application/json"}
)

# Print response
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}") 
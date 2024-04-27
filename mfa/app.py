from flask import Flask, request, jsonify
import pyotp
import os

app = Flask(__name__)

# Retrieve the secret key from environment variables
SECRET_KEY = os.getenv('OTP_SECRET')

@app.route('/validate_otp', methods=['POST'])
def validate_otp():
    user_otp = request.json.get('otp')
    
    totp = pyotp.TOTP(SECRET_KEY)
    if totp.verify(user_otp):
        return jsonify({'status': 'success'}), 200
    else:
        return jsonify({'status': 'failure'}), 401

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)


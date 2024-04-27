import pyotp
import sys

def get_otp(secret):
    totp = pyotp.TOTP(secret)
    return totp.now()

if __name__ == "__main__":
    secret_key = sys.argv[1]  # Pass the secret key as an argument
    print(get_otp(secret_key))


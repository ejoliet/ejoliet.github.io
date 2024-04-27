import pyotp
import qrcode
import os

# Function to generate a QR Code for a given TOTP secret
def regenerate_qr(secret):
    if not secret:
        raise ValueError("No secret key found in environment variables.")

    # Create a TOTP object
    totp = pyotp.TOTP(secret)
    
    # Define the label and issuer (customize as needed)
    label = "local@machine"  # Replace with your email or username
    issuer = "Secure App"  # Replace with your application's name
    
    # Generate the provisioning URI
    uri = totp.provisioning_uri(name=label, issuer_name=issuer)
    
    # Generate the QR Code
    qr = qrcode.make(uri)
    
    # Save the QR Code
    qr.save("mfa_qr.png")
    print("QR Code regenerated and saved as 'mfa_qr.png'.")

if __name__ == '__main__':
    # Fetch the secret key from an environment variable
    secret = os.getenv('OTP_SECRET')
    regenerate_qr(secret)


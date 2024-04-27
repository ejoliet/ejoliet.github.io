import pyotp
import qrcode

def generate_secret_and_qr():
    # Generate a random secret key
    secret = pyotp.random_base32()
    print("Secret Key:", secret)

    # Generate a TOTP object
    totp = pyotp.TOTP(secret)
    print("Current OTP:", totp.now())

    # Generate QR Code
    uri = totp.provisioning_uri(name="local@machine", issuer_name="Secure App")
    img = qrcode.make(uri)
    img.save("mfa_qr.png")
    print("QR Code saved as mfa_qr.png.")

if __name__ == "__main__":
    generate_secret_and_qr()


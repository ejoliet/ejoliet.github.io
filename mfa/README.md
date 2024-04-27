# Generate MFA

## python environment

create environment and activate.

```bash
'python3 -m venv .myvenv && source .myvenv/bin/activate'
```

## first time installation of the secret

```bash
pip install -r requirements.txt
```

then run to generate secret key and png to scan QR

`python generate_mfa.py`

Then use code to check

To regenerate QR with current secret, see `regenerate_qr.py`.

If issuer or name changes, change secrete and update app / docker next section.

# microservice

## build and installation 

export the secret in env to run the image.

use dockerfile to build an app rto expose MFA online

```bash
docker build -t otp-validation-service .
docker run -d -p 8001:8000 -e OTP_SECRET=$(echo $MFA_SECRET) otp-validation-service
```

## Usage

Try out with a current OTP, example:

`curl -X POST http://localhost:8001/validate_otp -H "Content-Type: application/json"   -d '{"otp":"703847"}'`

## integration with bash

```bash
function secure_aws_command {
    if [[ "$1" == "aws" ]]; then
        echo "Enter the OTP from your Authenticator App:"
        read user_otp
        
        # Call the microservice for OTP validation
        validation_response=$(curl -s -X POST http://localhost:8001/validate_otp \
                              -H "Content-Type: application/json" \
                              -d "{\"otp\":\"$user_otp\"}" | jq -r '.status')
        
        if [[ "$validation_response" == "success" ]]; then
            echo "Authentication successful."
            command aws "${@:2}"
        else
            echo "Authentication failed."
        fi
    else
        command "$@"
    fi
}
```




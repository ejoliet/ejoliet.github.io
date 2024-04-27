FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

EXPOSE 8000

# Set a default value or leave empty for the secret key
ENV OTP_SECRET=

CMD ["python", "app.py"]


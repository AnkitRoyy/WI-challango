import json
import httpx

API_KEY = "gak_41246124adb944199531d7aefdda91ba"
GSTIN = "33AAACC1206D1ZN"

def test_live():
    url = f"https://www.gstinapi.in/v1/gstin/{GSTIN}"
    headers = {"x-api-key": API_KEY}
    response = httpx.get(url, headers=headers, timeout=10.0)
    print(f"Status Code: {response.status_code}")
    print("Response JSON:")
    print(json.dumps(response.json(), indent=2))

if __name__ == "__main__":
    test_live()

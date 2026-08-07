import requests
import time

url = "https://overpass-api.de/api/interpreter"
query = """[out:json][timeout:30];
way["railway"="rail"](20.0,75.0,25.0,80.0);
out body geom;
"""

t0 = time.time()
r = requests.post(url, data={"data": query}, headers={"User-Agent": "RAKSHAK/1.0"})
print("Status:", r.status_code)
if r.status_code == 200:
    data = r.json()
    elements = data.get("elements", [])
    print("Fetched", len(elements), "railway ways in box in", round(time.time() - t0, 2), "seconds!")

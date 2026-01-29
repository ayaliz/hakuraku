import requests
import os
import urllib.parse

# Configuration
BASE_URL = "https://umsatei.com/img/"
FILE_SUFFIX = "_w_trans.png"
OUTPUT_FOLDER = "uma_ranks"

# 1. Define Standard Ranks (Low to SS+)
standard_ranks = [
    "G", "G+", 
    "F", "F+", 
    "E", "E+", 
    "D", "D+", 
    "C", "C+", 
    "B", "B+", 
    "A", "A+", 
    "S", "S+", 
    "SS", "SS+"
]

# 2. Define High Ranks (Unlimited Series: UG -> US)
# The pattern is usually the base Rank (e.g., UG) followed by UG1 through UG9.
u_prefixes = ["UG", "UF", "UE", "UD", "UC", "UB", "UA", "US"]
high_ranks = []

for prefix in u_prefixes:
    high_ranks.append(prefix)  # The base rank (e.g., "UG")
    for i in range(1, 10):
        high_ranks.append(f"{prefix}{i}")  # The numbered ranks (e.g., "UG1" to "UG9")

# Combine lists
all_ranks = standard_ranks + high_ranks

# Create output directory
if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)
    print(f"Created folder: {OUTPUT_FOLDER}")

def download_file(rank_name):
    """Attempts to download the rank icon, handling special characters like '+'."""
    
    # Construct the filename as it will be saved on your computer
    local_filename = f"{rank_name}{FILE_SUFFIX}"
    save_path = os.path.join(OUTPUT_FOLDER, local_filename)

    # List of URL variations to try (because '+' can be tricky in URLs)
    # 1. Direct string
    # 2. URL Encoded '+' (%2B)
    urls_to_try = [
        f"{BASE_URL}{rank_name}{FILE_SUFFIX}",
        f"{BASE_URL}{rank_name.replace('+', '%2B')}{FILE_SUFFIX}"
    ]

    for url in urls_to_try:
        try:
            response = requests.get(url, stream=True)
            if response.status_code == 200:
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(1024):
                        f.write(chunk)
                print(f"[OK] Downloaded: {rank_name}")
                return
            elif response.status_code == 404:
                continue # Try the next URL variation
        except Exception as e:
            print(f"[Error] Failed to connect for {rank_name}: {e}")
            return

    print(f"[Missing] Could not find file for rank: {rank_name}")

# Main execution loop
print(f"Starting download of {len(all_ranks)} icons...")
for rank in all_ranks:
    download_file(rank)

print("\nJob complete.")
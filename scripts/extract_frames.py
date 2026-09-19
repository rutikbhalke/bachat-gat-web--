import os
import subprocess

timestamps = {
    "01_login": "00:00:10",
    "02_dashboard": "00:00:30",
    "03_badge_blur_check": "00:00:34",
    "04_members": "00:00:52",
    "05_active_loan_member": "00:01:16",
    "06_member_profile": "00:01:32",
    "07_record_savings": "00:02:10",
    "08_loan_creation_details": "00:02:50",
    "09_loan_repayment": "00:03:20",
    "10_reports": "00:04:10",
    "11_taaleband": "00:04:30"
}

os.makedirs('demo-output/final/frames', exist_ok=True)
video_file = 'demo-output/final/Bachat-Gat-Demo-english.mp4'

for name, ts in timestamps.items():
    out_file = f'demo-output/final/frames/{name}.jpg'
    cmd = [
        'ffmpeg', '-y', '-ss', ts, '-i', video_file,
        '-vframes', '1', '-q:v', '2', out_file
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"Extracted {out_file} at {ts}")

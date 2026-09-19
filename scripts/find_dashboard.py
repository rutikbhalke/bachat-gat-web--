import os
import subprocess

video_file = 'demo-output/bachat-gat-demo.webm'

# Extract frames every 10 seconds to pinpoint the dashboard
os.makedirs('demo-output/scratch_frames', exist_ok=True)
cmd = [
    'ffmpeg', '-y', '-i', video_file, '-vf', 'fps=1/5', 'demo-output/scratch_frames/out%03d.jpg'
]
subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

import subprocess
import json

FFPROBE_PATH = r"C:\Users\Vaibhav\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-essentials_build\bin\ffprobe.exe"
VIDEO_PATH = "demo-output/bachat-gat-demo.webm"

cmd = [
    FFPROBE_PATH,
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    VIDEO_PATH
]
res = subprocess.run(cmd, capture_output=True, text=True, check=True)
print("Source duration:", float(res.stdout.strip()))

import json
import subprocess
import os
import re
from datetime import timedelta

def probe(file_path):
    cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file_path]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    return json.loads(result.stdout)

def parse_srt_time(t_str):
    h, m, s_ms = t_str.split(':')
    s, ms = s_ms.split(',')
    return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000.0

def analyze_srt(srt_path):
    with open(srt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    blocks = re.split(r'\n\n+', content.strip())
    subs = []
    for block in blocks:
        lines = block.split('\n')
        if len(lines) >= 3:
            times = lines[1].split(' --> ')
            if len(times) == 2:
                start = parse_srt_time(times[0])
                end = parse_srt_time(times[1])
                subs.append({'start': start, 'end': end, 'text': '\n'.join(lines[2:])})
    return subs

def main():
    report = []
    video_file = 'demo-output/bachat-gat-demo.webm'
    v_probe = probe(video_file)
    v_dur = float(v_probe['format']['duration'])
    report.append(f"Video: {video_file} (Duration: {v_dur:.2f}s)")
    
    for lang in ['english', 'hindi', 'marathi']:
        audio_file = f'demo-output/audio/{lang}.mp3'
        if os.path.exists(audio_file):
            a_probe = probe(audio_file)
            a_dur = float(a_probe['format']['duration'])
            report.append(f"Audio ({lang}): {audio_file} (Duration: {a_dur:.2f}s)")
        
        srt_file = f'demo-output/subtitles/{lang}.srt'
        if os.path.exists(srt_file):
            subs = analyze_srt(srt_file)
            report.append(f"Subtitles ({lang}): {len(subs)} entries.")
            gaps = []
            for i in range(len(subs)-1):
                gap = subs[i+1]['start'] - subs[i]['end']
                if gap > 3.0:
                    gaps.append((subs[i]['end'], subs[i+1]['start'], gap))
            report.append(f"  Detected {len(gaps)} gaps > 3.0s in {lang}")
            for g in gaps:
                report.append(f"    Gap: {g[0]:.2f}s to {g[1]:.2f}s (Duration: {g[2]:.2f}s)")

    with open('demo-output/inspection_report.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))
    print("Report generated at demo-output/inspection_report.txt")
        
if __name__ == '__main__':
    main()

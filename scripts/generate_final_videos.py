import os
import re
import subprocess
import json

def time_to_secs(t_str):
    h, m, s = t_str.split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)

def secs_to_time(secs):
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def probe(file_path):
    cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file_path]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    return json.loads(result.stdout)

def process_language(lang):
    os.makedirs('demo-output/final', exist_ok=True)
    
    ass_path = f'demo-output/subtitles/{lang}.ass'
    video_path = 'demo-output/bachat-gat-demo.webm'
    audio_path = f'demo-output/audio/{lang}.mp3'
    
    if not os.path.exists(ass_path):
        return f"Skipping {lang}, ASS missing."
        
    with open(ass_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    events = []
    header = []
    in_events = False
    for line in lines:
        if line.startswith('[Events]'):
            in_events = True
            header.append(line)
        elif in_events and line.startswith('Dialogue:'):
            parts = line.strip().split(',', 9)
            start = time_to_secs(parts[1])
            end = time_to_secs(parts[2])
            events.append({
                'start': start,
                'end': end,
                'parts': parts,
                'line': line
            })
        else:
            if not in_events or line.startswith('Format:'):
                # FIX ISSUE 2: Adjust MarginV to 160
                if line.startswith('Style: Default'):
                    # The format is: Style: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
                    parts = line.strip().split(',')
                    if len(parts) >= 22:
                        parts[21] = '160' # MarginV
                    line = ','.join(parts) + '\n'
                header.append(line)
                
    events.sort(key=lambda x: x['start'])
    
    video_dur = float(probe(video_path)['format']['duration'])
    
    segments = []
    current_time = 0.0
    SPEEDUP = 4.0
    PADDING = 0.5
    
    for event in events:
        start = event['start']
        end = event['end']
        
        gap_start = current_time + PADDING
        gap_end = start - PADDING
        
        if gap_end - gap_start > 1.5:
            if gap_start > current_time:
                segments.append({'type': 'normal', 'start': current_time, 'end': gap_start, 'speed': 1.0})
            
            segments.append({'type': 'fast', 'start': gap_start, 'end': gap_end, 'speed': SPEEDUP})
            
            segments.append({'type': 'normal', 'start': gap_end, 'end': end, 'speed': 1.0})
        else:
            if end > current_time:
                segments.append({'type': 'normal', 'start': current_time, 'end': end, 'speed': 1.0})
        
        current_time = max(current_time, end)
        
    if current_time < video_dur:
        gap_start = current_time + PADDING
        if video_dur - gap_start > 1.5:
            segments.append({'type': 'normal', 'start': current_time, 'end': gap_start, 'speed': 1.0})
            segments.append({'type': 'fast', 'start': gap_start, 'end': video_dur, 'speed': SPEEDUP})
        else:
            segments.append({'type': 'normal', 'start': current_time, 'end': video_dur, 'speed': 1.0})

    cons_segments = []
    for s in segments:
        if not cons_segments:
            cons_segments.append(s)
        else:
            last = cons_segments[-1]
            if last['type'] == s['type'] and abs(last['end'] - s['start']) < 0.1 and last['speed'] == s['speed']:
                last['end'] = max(last['end'], s['end'])
            else:
                cons_segments.append(s)
                
    def get_new_time(old_t):
        new_t = 0.0
        for s in cons_segments:
            if old_t <= s['start']:
                break
            if old_t >= s['end']:
                new_t += (s['end'] - s['start']) / s['speed']
            else:
                new_t += (old_t - s['start']) / s['speed']
                break
        return new_t

    out_lines = header[:]
    for event in events:
        new_start = get_new_time(event['start'])
        new_end = get_new_time(event['end'])
        
        parts = event['parts']
        parts[1] = secs_to_time(new_start)
        parts[2] = secs_to_time(new_end)
        out_lines.append(','.join(parts) + '\n')
        
    adj_ass_path = f'demo-output/final/{lang}_adjusted.ass'
    ass_ffmpeg_path = os.path.abspath(adj_ass_path).replace('\\', '/').replace(':', '\\:')
    
    with open(adj_ass_path, 'w', encoding='utf-8') as f:
        f.writelines(out_lines)
        
    filters = []
    concat_inputs = []
    
    for i, s in enumerate(cons_segments):
        st = s['start']
        en = s['end']
        
        v_speed = 1.0 / s['speed']
        
        # Apply drawbox BEFORE trim so it evaluates original video timestamps
        drawbox_str = "drawbox=x=650:y=110:w=370:h=40:color=black@1.0:t=fill:enable='between(t,21.0,51.5)+between(t,316.0,355.0)'"
        filters.append(f"[0:v]{drawbox_str},trim=start={st:.3f}:end={en:.3f},setpts={v_speed}*(PTS-STARTPTS)[v{i}];")
        
        if s['speed'] == 1.0:
            filters.append(f"[1:a]atrim=start={st:.3f}:end={en:.3f},asetpts=PTS-STARTPTS[a{i}];")
        else:
            filters.append(f"[1:a]atrim=start={st:.3f}:end={en:.3f},asetpts=PTS-STARTPTS,atempo={s['speed']}[a{i}];")
            
        concat_inputs.append(f"[v{i}][a{i}]")
        
    concat_filter = "".join(concat_inputs) + f"concat=n={len(cons_segments)}:v=1:a=1[final_v_noass][aout];"
    filters.append(concat_filter)
    
    # Apply subtitles to the final concatenated video
    filters.append(f"[final_v_noass]ass='{ass_ffmpeg_path}'[final_v]")
    
    filter_string = "".join(filters)
        
    out_video = f'demo-output/final/Bachat-Gat-Demo-{lang}.mp4'
    
    cmd = [
        'ffmpeg', '-y', 
        '-i', video_path, 
        '-i', audio_path, 
        '-filter_complex', filter_string, 
        '-map', '[final_v]', 
        '-map', '[aout]', 
        '-c:v', 'libx264', 
        '-preset', 'fast', 
        '-crf', '22',
        '-c:a', 'aac', 
        '-b:a', '128k', 
        out_video
    ]
    
    print(f"Running ffmpeg for {lang}...")
    subprocess.run(cmd, check=True)
    
    res = probe(out_video)
    final_dur = float(res['format']['duration'])
    return f"Success {lang}: Original {video_dur:.1f}s -> Final {final_dur:.1f}s. {len(cons_segments)} segments."

def main():
    report = []
    for lang in ['english', 'hindi', 'marathi']:
        try:
            msg = process_language(lang)
            report.append(msg)
            print(msg)
        except Exception as e:
            report.append(f"Error {lang}: {e}")
            print(f"Error {lang}: {e}")
            
    with open('demo-output/final/processing_report.txt', 'w') as f:
        f.write('\n'.join(report))
        
if __name__ == '__main__':
    main()

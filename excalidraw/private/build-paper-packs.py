"""Fetch a small, attributed set of network-paper drawing assets. Standard library only."""
import concurrent.futures
import hashlib
import json
import math
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(sys.argv[1]) if __name__ == '__main__' else None
RAW = 'https://raw.githubusercontent.com/'
UPSTREAM = 'excalidraw/excalidraw-libraries/main/'
NATIVE = {
    'network-topology': 'dwelle/network-topology-icons',
    'network-elements': 'samu_x86/network-elements',
    'racks-and-servers': 'jgodoy/racks-and-servers-components',
}
SVG = {
    'lucide-security': ('lucide-icons/lucide/main/', 'icons/', {
        'shield-check': '策略检查', 'fingerprint-pattern': '身份认证', 'key-round': '密钥',
        'file-lock': '受保护文件', 'logs': '审计日志',
    }),
    'tabler-security': ('tabler/tabler-icons/main/', 'icons/outline/', {
        'lock-access': '访问控制', 'shield-lock': '安全防护', 'fingerprint-scan': '指纹扫描',
        'server-2': '服务器', 'report-analytics': '监测报告',
    }),
}


def fetch(path):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(RAW + path, timeout=8) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise


def arc(a, b, rx, ry, degrees, large, sweep):
    if a == b:
        return []
    if not rx or not ry:
        return [b]
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(degrees)
    c, s = math.cos(phi), math.sin(phi)
    dx, dy = (a[0] - b[0]) / 2, (a[1] - b[1]) / 2
    x, y = c*dx + s*dy, -s*dx + c*dy
    factor = math.sqrt(max(1, (x/rx)**2 + (y/ry)**2))
    rx, ry = rx*factor, ry*factor
    denominator = (rx*y)**2 + (ry*x)**2
    f = math.sqrt(max(0, ((rx*ry)**2 - denominator) / denominator)) * (-1 if large == sweep else 1)
    ux, uy = f*rx*y/ry, -f*ry*x/rx
    cx, cy = c*ux - s*uy + (a[0]+b[0])/2, s*ux + c*uy + (a[1]+b[1])/2
    theta = math.atan2((y-uy)/ry, (x-ux)/rx)
    end = math.atan2((-y-uy)/ry, (-x-ux)/rx)
    delta = (end - theta) % (2*math.pi)
    if not sweep: delta -= 2*math.pi
    n = max(4, math.ceil(abs(delta)*6))
    points = []
    for i in range(1, n):
        angle = theta + delta*i/n
        u, v = rx*math.cos(angle), ry*math.sin(angle)
        points.append((cx+c*u-s*v, cy+s*u+c*v))
    return points + [b]


TOKEN = re.compile(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?')
ARITY = dict(M=2, L=2, H=1, V=1, C=6, S=4, Q=4, T=2, A=7)


def paths(d):
    tokens = TOKEN.findall(d)
    i, p, start, sub, command, previous, control = 0, (0, 0), (0, 0), [], None, '', None
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]; i += 1
        k = command.upper()
        if k == 'Z':
            if sub: sub.append(start)
            p, previous, control, command = start, k, None, None
            continue
        count = ARITY[k]
        v = tuple(map(float, tokens[i:i+count])); i += count
        offset = p if command.islower() else (0, 0)
        def xy(j): return offset[0]+v[j], offset[1]+v[j+1]
        end, extra, next_control = p, [], None
        if k == 'M':
            if len(sub) > 1: yield sub
            end = start = xy(0)
            sub = [end]
            command = 'l' if command.islower() else 'L'
        elif k == 'L': end, extra = xy(0), [xy(0)]
        elif k == 'H': end = (offset[0]+v[0], p[1]); extra = [end]
        elif k == 'V': end = (p[0], offset[1]+v[0]); extra = [end]
        elif k in ('C', 'S', 'Q', 'T'):
            reflect = (2*p[0]-control[0], 2*p[1]-control[1]) if control else p
            if k == 'C': a, b, end = xy(0), xy(2), xy(4)
            if k == 'S': a, b, end = (reflect if previous in ('S','C') else p), xy(0), xy(2)
            if k == 'Q': a, end = xy(0), xy(2)
            if k == 'T': a, end = (reflect if previous in ('T','Q') else p), xy(0)
            next_control = b if k in ('C','S') else a
            for j in range(1, 13):
                t = j / 12; u = 1-t
                if k in ('C','S'): extra.append(tuple(u**3*p[l]+3*u*u*t*a[l]+3*u*t*t*b[l]+t**3*end[l] for l in (0,1)))
                else: extra.append(tuple(u*u*p[l]+2*u*t*a[l]+t*t*end[l] for l in (0,1)))
        elif k == 'A':
            end = xy(5); extra = arc(p, end, *v[:5])
        sub.extend(extra)
        p, previous, control = end, k, next_control
    if len(sub) > 1: yield sub


def stable(text): return hashlib.sha256(text.encode()).hexdigest()[:20]


def convert(blob, group):
    svg = ET.fromstring(blob)
    assert svg.attrib['viewBox'] == '0 0 24 24'
    result = []
    for node in svg:
        tag = node.tag.rsplit('}',1)[-1]
        v = node.attrib
        if tag in ('title','desc') or v.get('stroke') == 'none' and v.get('fill') == 'none': continue
        if tag == 'path': shapes = list(paths(v['d']))
        elif tag == 'line': shapes = [[(float(v['x1']),float(v['y1'])),(float(v['x2']),float(v['y2']))]]
        elif tag in ('polyline','polygon'):
            points = list(map(float, re.findall(r'[-+]?[\d.]+',v['points'])))
            shape = list(zip(points[::2],points[1::2])); shapes = [shape + ([shape[0]] if tag == 'polygon' else [])]
        elif tag == 'circle':
            x, y, r = (float(v[a]) for a in ('cx','cy','r'))
            shapes = [[(x+r*math.cos(i*math.pi/16),y+r*math.sin(i*math.pi/16)) for i in range(33)]]
        elif tag == 'rect':
            x,y,w,h = [float(v.get(a,0)) for a in ('x','y','width','height')]
            r = float(v.get('rx',0))
            shapes = list(paths(f'M{x+r} {y}H{x+w-r}q{r} 0 {r} {r}V{y+h-r}q0 {r} {-r} {r}H{x+r}q{-r} 0 {-r} {-r}V{y+r}q0 {-r} {r} {-r}Z'))
        else: raise ValueError(tag)
        for stroke in shapes:
            if len(set(stroke)) < 2: continue
            ox, oy = (v*4 for v in stroke[0]); points = [[round(x*4-ox,3),round(y*4-oy,3)] for x,y in stroke]
            width, height = (max(p[i] for p in points)-min(p[i] for p in points) for i in (0,1))
            eid = stable(f'{group}-{len(result)}')
            result.append(dict(type='line',id=eid,version=1,versionNonce=1,isDeleted=False,x=ox,y=oy,width=width,height=height,angle=0,strokeColor='#1e1e1e',backgroundColor=v.get('fill','transparent') if v.get('fill') not in (None,'none','currentColor') else ('#1e1e1e' if v.get('fill')=='currentColor' else 'transparent'),fillStyle='solid',strokeWidth=4,strokeStyle='solid',roughness=0,opacity=100,groupIds=[group],frameId=None,roundness=None,seed=int(eid[:7],16),boundElements=None,updated=0,link=None,locked=False,points=points,lastCommittedPoint=None,startBinding=None,endBinding=None,startArrowhead=None,endArrowhead=None))
    assert result
    return result


def save(pack, url, items):
    for i, item in enumerate(items):
        item['id'] = 'paper-pack-' + pack + '-' + stable(item.get('id') or str(i))
        if not item.get('name'): item['name'] = f'{pack} {i+1}'
    payload = dict(type='excalidrawlib',version=2,source=url,libraryItems=items)
    (OUT / f'{pack}.excalidrawlib').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
    print(pack, len(items))


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    tasks = {'excalidraw-license': UPSTREAM+'LICENSE'}
    for pack, source in NATIVE.items(): tasks[pack] = UPSTREAM + 'libraries/' + source + '.excalidrawlib'
    for pack, (repo, directory, names) in SVG.items():
        tasks[f'{pack}/LICENSE'] = repo+'LICENSE'
        for name in names: tasks[f'{pack}/{name}.svg'] = repo+directory+name+'.svg'
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        files = dict(zip(tasks, pool.map(fetch, tasks.values())))
    (OUT/'Excalidraw-LICENSE.txt').write_bytes(files['excalidraw-license'])
    for pack in NATIVE:
        data = json.loads(files[pack]); assert data['type']=='excalidrawlib'
        save(pack, RAW+tasks[pack], data['libraryItems'])
    for pack, (repo, directory, names) in SVG.items():
        (OUT/pack).mkdir(exist_ok=True)
        (OUT/pack/'LICENSE').write_bytes(files[f'{pack}/LICENSE'])
        items=[]
        for name, label in names.items():
            filename=f'{pack}/{name}.svg'; source=files[filename]; (OUT/filename).write_bytes(source)
            group=stable(f'{pack}/{name}')
            items.append(dict(id=name, name=f'{pack.split("-")[0].capitalize()} · {label} · {name}', status='published', created=int(time.time()*1000), elements=convert(source,group)))
        save(pack, 'https://github.com/' + repo.removesuffix('/main/'), items)
    (OUT/'SOURCES.md').write_text('# 网络安全论文组件包\n\n三个 Excalidraw 社区目录包保留原生图形，仅调整素材条目 ID。\n\n'+'\n'.join(f'- {pack}: {RAW+tasks[pack]}' for pack in NATIVE)+ '\n\nLucide 与 Tabler 目录中保留源 SVG 和 LICENSE。上层 `.excalidrawlib` 将描边采样为可编辑折线；不是原样 SVG。\n\n- [Lucide](https://lucide.dev/license)\n- [Tabler Icons](https://github.com/tabler/tabler-icons/blob/main/LICENSE)\n')

if __name__ == '__main__': main()

"""Install the offline preview on a test emulator and check its real Android UI."""
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

out = Path('android-smoke')
out.mkdir(exist_ok=True)


def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=45)


def screen():
    adb('shell', 'uiautomator', 'dump', '/sdcard/cad-preview.xml')
    data = adb('shell', 'cat', '/sdcard/cad-preview.xml')
    (out / 'window.xml').write_bytes(data)
    return ET.fromstring(data)


def find(root, label):
    return next((node for node in root.iter('node')
                 if label in (node.get('text', '') + node.get('content-desc', ''))), None)


def wait_for(label):
    for _ in range(12):
        try:
            root = screen()
            node = find(root, label)
            if node is not None:
                return node
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ET.ParseError):
            # Immediately after boot or Activity transitions, UiAutomator can
            # return no root node even though the app has launched correctly.
            pass
        time.sleep(2)
    (out / 'android-falha.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    (out / 'android-logcat.txt').write_bytes(adb('logcat', '-d', '-s', 'Capacitor', 'AndroidRuntime', 'chromium'))
    raise AssertionError(f'Android UI missing: {label}')


adb('install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk')
launch = adb('shell', 'am', 'start', '-W', '-n',
             'br.com.campodogado.manutencao.debug/br.com.campodogado.manutencao.MainActivity')
(out / 'launch.txt').write_bytes(launch)
node = wait_for('Abrir menu')
(out / 'android-inicio.png').write_bytes(adb('exec-out', 'screencap', '-p'))
x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
wait_for('Fechar menu')
wait_for('Equipamentos')
(out / 'android-menu-instalado.png').write_bytes(adb('exec-out', 'screencap', '-p'))
adb('shell', 'input', 'keyevent', '4')
wait_for('Explorar o menu')
assert find(screen(), 'Fechar menu') is None, 'Android Back did not close the menu'
(out / 'validacao-android.json').write_text(json.dumps({
    'status': 'PASS', 'installed': True, 'launched': True,
    'native_card_menu_opened': True, 'android_back_closed_menu': True,
    'application_id': 'br.com.campodogado.manutencao.debug',
    'scope': 'Offline preview; production login and business flows not tested',
}, indent=2), encoding='utf-8')
print('ANDROID_PREVIEW_SMOKE_PASS')
